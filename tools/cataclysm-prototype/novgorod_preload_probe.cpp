// Restricted Linux host for the P4 warm-child prototype.
// Start with NOVGOROD_P4_MODE=preload, NOVGOROD_P4_WORLD=<world>,
// NOVGOROD_P4_PROFILE_KEY=<64 lowercase hex chars>, and --user-dir pointing
// at immutable profile metadata. Each request is a JSON object line with
// mode, userdir, op, failpoint, and profile_key. QUIT or EOF ends the host.
// The child inherits the initialized static definitions and metadata, rebinds
// user paths/caches, loads the native world, then returns to the existing P4
// Catch test body. The parent never loads a physical world or runs an action.

#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <sstream>
#include <string_view>
#include <system_error>
#include <vector>

#include "cata_catch.h"
#include "game.h"
#include "json.h"
#include "json_loader.h"
#include "path_info.h"
#include "worldfactory.h"

#if defined(__linux__)
#include <dirent.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/prctl.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

extern bool novgorod_p4_strict_load( const save_t &name );
extern double novgorod_p4_load_ms;
extern double novgorod_p4_static_data_ms;
extern double novgorod_p4_metadata_ms;
extern double novgorod_p4_bootstrap_ms;
extern double novgorod_p4_core_data_ms;

void novgorod_p4_configure_user_paths( const std::string &user_dir )
{
    PATH_INFO::init_base_path( "" );
    PATH_INFO::init_user_dir( user_dir );
#if defined(USE_XDG_DIR)
    const std::string config_root = ( std::filesystem::path( user_dir ) / ".p4-xdg" ).string();
    if( setenv( "XDG_CONFIG_HOME", config_root.c_str(), 1 ) != 0 ) {
        throw std::runtime_error( "cannot set scratch XDG_CONFIG_HOME" );
    }
#endif
    PATH_INFO::set_standard_filenames();
}

namespace
{
bool path_is_under( const std::filesystem::path &child, const std::filesystem::path &parent )
{
    const std::filesystem::path relative = child.lexically_normal().lexically_relative(
                                              parent.lexically_normal() );
    return !relative.empty() && *relative.begin() != std::filesystem::path( ".." ) &&
           !relative.is_absolute();
}

bool preload_single_thread( std::string &reason )
{
#if defined(__linux__)
    DIR *const task_dir = opendir( "/proc/self/task" );
    if( task_dir == nullptr ) {
        reason = "cannot enumerate /proc/self/task";
        return false;
    }
    int count = 0;
    errno = 0;
    while( const dirent *const entry = readdir( task_dir ) ) {
        if( entry->d_name[0] >= '0' && entry->d_name[0] <= '9' ) {
            ++count;
        }
    }
    const int read_error = errno;
    closedir( task_dir );
    if( read_error != 0 || count != 1 ) {
        reason = read_error ? "cannot enumerate /proc/self/task" :
                 "pre-fork thread count is " + std::to_string( count );
        return false;
    }
    return true;
#else
    reason = "pre-fork thread guard requires Linux /proc";
    return false;
#endif
}

bool preload_has_open_save_file( std::string &reason )
{
#if defined(__linux__)
    DIR *const fd_dir = opendir( "/proc/self/fd" );
    if( fd_dir == nullptr ) {
        reason = "cannot enumerate /proc/self/fd";
        return true;
    }
    const int enumeration_fd = dirfd( fd_dir );
    std::error_code path_error;
    const std::filesystem::path save_root = std::filesystem::weakly_canonical(
                std::filesystem::absolute( PATH_INFO::savedir() ), path_error );
    if( path_error ) {
        closedir( fd_dir );
        reason = "cannot resolve native save directory";
        return true;
    }
    bool found = false;
    bool inspect_error = false;
    while( const dirent *const entry = readdir( fd_dir ) ) {
        char *end = nullptr;
        const long fd_number = std::strtol( entry->d_name, &end, 10 );
        if( end == entry->d_name || *end != '\0' || fd_number == enumeration_fd ) {
            continue;
        }
        char target[4096];
        const ssize_t length = readlink( ( std::string( "/proc/self/fd/" ) + entry->d_name ).c_str(),
                                         target, sizeof( target ) - 1 );
        if( length <= 0 ) {
            reason = "cannot inspect open file descriptor";
            inspect_error = true;
            break;
        }
        target[length] = '\0';
        std::string path( target );
        constexpr std::string_view deleted = " (deleted)";
        if( path.size() >= deleted.size() &&
            path.compare( path.size() - deleted.size(), deleted.size(), deleted.data(),
                          deleted.size() ) == 0 ) {
            path.resize( path.size() - deleted.size() );
        }
        path_error.clear();
        const std::filesystem::path target_path = std::filesystem::weakly_canonical(
                    std::filesystem::path( path ), path_error );
        if( path_error ) {
            reason = "cannot resolve open file descriptor path";
            inspect_error = true;
            break;
        }
        if( path_is_under( target_path, save_root ) ) {
            found = true;
            break;
        }
    }
    closedir( fd_dir );
    if( found ) {
        reason = "open file remains under native save directory";
    }
    return found || inspect_error;
#else
    reason = "save-file guard requires Linux /proc";
    return true;
#endif
}

bool preload_preflight( std::string &reason )
{
    return preload_single_thread( reason ) && !preload_has_open_save_file( reason );
}

#if defined(__linux__)
std::string hex_encode( const char *data, const size_t length )
{
    static constexpr char digits[] = "0123456789abcdef";
    std::string encoded;
    encoded.reserve( length * 2 );
    for( size_t i = 0; i < length; ++i ) {
        const unsigned char value = static_cast<unsigned char>( data[i] );
        encoded.push_back( digits[value >> 4] );
        encoded.push_back( digits[value & 0x0f] );
    }
    return encoded;
}

struct Request
{
    std::string mode;
    std::string user_dir;
    std::string operation;
    std::string failpoint;
    std::string profile_key;
};

bool parse_request( const std::string &line, Request &request )
{
    try {
        std::istringstream input( line );
        TextJsonIn json( input );
        TextJsonObject object = json.get_object();
        request.mode = object.get_string( "mode" );
        request.user_dir = object.get_string( "userdir" );
        request.operation = object.get_string( "op" );
        request.failpoint = object.get_string( "failpoint" );
        request.profile_key = object.get_string( "profile_key" );
        return true;
    } catch( const std::exception & ) {
        return false;
    }
}

bool valid_profile_key( const std::string &key )
{
    return key.size() == 64 && key.find_first_not_of( "0123456789abcdef" ) == std::string::npos;
}

bool valid_operation( const std::string &operation )
{
    return operation == "pickup_rock" || operation == "pickup_stick" ||
           operation == "move_east" || operation == "partial_hacksaw";
}

bool valid_failpoint( const std::string &failpoint )
{
    return failpoint.empty() || failpoint == "after_effect" || failpoint == "mid_save";
}

void emit_frame( const std::string &frame )
{
    std::cout << '\n' << "NOVGOROD_PRELOAD_" << frame << '\n' << std::flush;
}

volatile bool preload_child_process = false;

bool serve_one( const Request &request, const save_t &save, const std::string &host_profile )
{
    if( ( request.mode != "apply" && request.mode != "read" ) || request.user_dir.empty() ||
        request.user_dir.find_first_of( "\r\n\t" ) != std::string::npos ||
        !valid_operation( request.operation ) || !valid_failpoint( request.failpoint ) ||
        !valid_profile_key( request.profile_key ) ) {
        emit_frame( "REJECT\trequest" );
        return true;
    }
    if( request.profile_key != host_profile ) {
        emit_frame( "REJECT\tprofile_mismatch" );
        return true;
    }
    const std::filesystem::path candidate_path( request.user_dir );
    std::error_code path_error;
    if( !candidate_path.is_absolute() ||
        !std::filesystem::is_directory( candidate_path, path_error ) || path_error ) {
        emit_frame( "REJECT\tpath" );
        return true;
    }
    std::string reason;
    if( !preload_preflight( reason ) ) {
        emit_frame( "REJECT\tpreflight\t" + reason );
        return false;
    }
    int output_pipe[2];
    if( pipe( output_pipe ) != 0 ) {
        emit_frame( "REJECT\tpipe" );
        return false;
    }
    std::cout.flush();
    const pid_t parent_pid = getpid();
    const pid_t child = fork();
    if( child < 0 ) {
        close( output_pipe[0] );
        close( output_pipe[1] );
        emit_frame( "REJECT\tfork" );
        return false;
    }
    if( child == 0 ) {
        close( output_pipe[0] );
        if( prctl( PR_SET_PDEATHSIG, SIGKILL ) != 0 || getppid() != parent_pid ) {
            _exit( 119 );
        }
        const int null_fd = open( "/dev/null", O_RDONLY );
        if( null_fd < 0 || dup2( output_pipe[1], STDOUT_FILENO ) < 0 ||
            dup2( output_pipe[1], STDERR_FILENO ) < 0 || dup2( null_fd, STDIN_FILENO ) < 0 ) {
            _exit( 120 );
        }
        if( null_fd > STDERR_FILENO ) {
            close( null_fd );
        }
        if( output_pipe[1] > STDERR_FILENO ) {
            close( output_pipe[1] );
        }
        if( setenv( "NOVGOROD_P4_MODE", request.mode.c_str(), 1 ) != 0 ||
            setenv( "NOVGOROD_P4_OPERATION", request.operation.c_str(), 1 ) != 0 ||
            setenv( "NOVGOROD_P4_FAILPOINT", request.failpoint.c_str(), 1 ) != 0 ) {
            _exit( 121 );
        }
        try {
            novgorod_p4_configure_user_paths( request.user_dir );
            const std::filesystem::path candidate_root = std::filesystem::absolute(
                        request.user_dir ).lexically_normal();
            if( !path_is_under( std::filesystem::absolute( PATH_INFO::config_dir() ), candidate_root ) ||
                !path_is_under( std::filesystem::absolute( PATH_INFO::savedir() ), candidate_root ) ) {
                _exit( 124 );
            }
            json_loader::reset_path_caches_for_fork_test();
            const auto load_start = std::chrono::steady_clock::now();
            if( !novgorod_p4_strict_load( save ) ) {
                _exit( 122 );
            }
            novgorod_p4_load_ms = std::chrono::duration<double, std::milli>(
                                      std::chrono::steady_clock::now() - load_start ).count();
            preload_child_process = true;
            return true;
        } catch( ... ) {
            _exit( 123 );
        }
    }
    close( output_pipe[1] );
    emit_frame( "CHILD\t" + std::to_string( child ) + "\t" + request.mode + "\t" +
                request.operation );
    char buffer[4096];
    for( ;; ) {
        const ssize_t count = read( output_pipe[0], buffer, sizeof( buffer ) );
        if( count > 0 ) {
            emit_frame( "OUTPUT\t" + hex_encode( buffer, static_cast<size_t>( count ) ) );
        } else if( count < 0 && errno == EINTR ) {
            continue;
        } else {
            break;
        }
    }
    close( output_pipe[0] );
    int status = 0;
    pid_t waited;
    do {
        waited = waitpid( child, &status, 0 );
    } while( waited < 0 && errno == EINTR );
    if( waited < 0 ) {
        emit_frame( "DONE\t" + std::to_string( child ) + "\twait_error" );
        return false;
    }
    if( WIFEXITED( status ) ) {
        emit_frame( "DONE\t" + std::to_string( child ) + "\texit\t" +
                    std::to_string( WEXITSTATUS( status ) ) );
    } else if( WIFSIGNALED( status ) ) {
        emit_frame( "DONE\t" + std::to_string( child ) + "\tsignal\t" +
                    std::to_string( WTERMSIG( status ) ) );
    } else {
        emit_frame( "DONE\t" + std::to_string( child ) + "\tunknown" );
    }
    return true;
}
#endif
} // namespace

int novgorod_p4_serve_preload( const std::string &user_dir )
{
#if defined(__linux__)
    const std::filesystem::path host_root = std::filesystem::absolute( user_dir ).lexically_normal();
    if( !path_is_under( std::filesystem::absolute( PATH_INFO::config_dir() ), host_root ) ||
        !path_is_under( std::filesystem::absolute( PATH_INFO::savedir() ), host_root ) ) {
        std::cerr << "NOVGOROD_PRELOAD_REFUSED:user paths escaped profile scratch\n";
        return EXIT_FAILURE;
    }
    const char *const key_env = std::getenv( "NOVGOROD_P4_PROFILE_KEY" );
    const std::string profile_key = key_env == nullptr ? "" : key_env;
    if( !valid_profile_key( profile_key ) ) {
        std::cerr << "NOVGOROD_PRELOAD_REFUSED:missing or invalid NOVGOROD_P4_PROFILE_KEY\n";
        return EXIT_FAILURE;
    }
    std::string reason;
    if( !preload_preflight( reason ) ) {
        std::cerr << "NOVGOROD_PRELOAD_REFUSED:" << reason << '\n';
        return EXIT_FAILURE;
    }
    const char *const world_name = std::getenv( "NOVGOROD_P4_WORLD" );
    WORLD *const world = world_name == nullptr ? nullptr : world_generator->get_world( world_name );
    if( world == nullptr || world->world_saves.empty() ) {
        std::cerr << "NOVGOROD_PRELOAD_REFUSED:missing world save metadata\n";
        return EXIT_FAILURE;
    }
    emit_frame( "READY\t{\"parent_pid\":" + std::to_string( getpid() ) +
                ",\"profile_key\":\"" + profile_key + "\",\"bootstrap_ms\":" +
                std::to_string( novgorod_p4_bootstrap_ms ) + ",\"definitions_ms\":" +
                std::to_string( novgorod_p4_static_data_ms + novgorod_p4_core_data_ms ) +
                ",\"static_data_ms\":" +
                std::to_string( novgorod_p4_static_data_ms ) + ",\"metadata_ms\":" +
                std::to_string( novgorod_p4_metadata_ms ) + ",\"core_data_ms\":" +
                std::to_string( novgorod_p4_core_data_ms ) + "}" );
    std::string line;
    while( std::getline( std::cin, line ) ) {
        if( line == "QUIT" ) {
            _exit( EXIT_SUCCESS );
        }
        if( line.size() > 8192 || line.find( '\0' ) != std::string::npos ) {
            emit_frame( "REJECT\trequest" );
            continue;
        }
        Request request;
        if( !parse_request( line, request ) ) {
            emit_frame( "REJECT\trequest_json" );
            continue;
        }
        if( !serve_one( request, world->world_saves.front(), profile_key ) ) {
            return EXIT_FAILURE;
        }
        if( preload_child_process ) {
            return EXIT_SUCCESS;
        }
    }
    _exit( EXIT_SUCCESS );
#else
    ( void )user_dir;
    std::cerr << "NOVGOROD_PRELOAD_REFUSED:Linux only\n";
    return EXIT_FAILURE;
#endif
}

TEST_CASE( "Novgorod preload save descriptor guard", "[.][novgorod_preload_guard]" )
{
#if defined(__linux__)
    std::string reason;
    CHECK( preload_single_thread( reason ) );
    const std::filesystem::path save_root( PATH_INFO::savedir() );
    std::filesystem::create_directories( save_root );
    std::string path = ( save_root / ( "novgorod-preload-guard-" + std::to_string( getpid() ) ) ).string();
    const int fd = open( path.c_str(), O_CREAT | O_EXCL | O_RDWR, 0600 );
    REQUIRE( fd >= 0 );
    reason.clear();
    CHECK( preload_has_open_save_file( reason ) );
    close( fd );
    std::filesystem::remove( path );
    reason.clear();
    CHECK_FALSE( preload_has_open_save_file( reason ) );
#else
    SUCCEED( "preload prototype is Linux-only" );
#endif
}


