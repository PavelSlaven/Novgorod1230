import { Spinner, Stage, type Act } from '../../kit'
import { FIELD } from './field'
import { PROSE_A } from './prose'
import './screen.css'

// The Novgorod1230 main screen at 1600 × 900, the whole game window, for the
// owner to choose a layout and a look before any game code. Every word is real:
// prose from the live check of 2026-11-02 (scene A), the field from the same
// check's native CDDA frame, signs, place and date from that frame's sidebar,
// clothes from the slice mod. URL: ?capture=novgorod-screen&look=book&frame=turn

type Look = 'book' | 'evening' | 'flat' | 'night'
type Frame = 'turn' | 'talk' | 'wait' | 'inv-native' | 'inv-html' | 'journal' | 'field' | 'loop'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const LOOK = (params.get('look') ?? 'book') as Look
const FRAME = (params.get('frame') ?? 'turn') as Frame

const CONTEXT = ['Четверг, 20 августа', 'около полудня', 'двор плотника', 'ясно, тихий ветер']
const TABS = ['Персонаж', 'Ноша', 'Люди', 'Журнал', 'Карта', 'Поручения']
const SIGNS: { text: string; warn?: boolean }[] = [
  { text: 'Сильная жажда', warn: true },
  { text: 'Небольшой голод' },
  { text: 'Тепло' },
  { text: 'Утомления нет' },
]
const WORN = ['рубаха', 'порты', 'кожаный пояс', 'онучи', 'поршни', 'кожаный кошель']
const HERO: [number, number] = [20, 38]
const ROWS = FIELD['A1-after'].rows

const ASK = 'Где ты живёшь?'
const ANSWER = PROSE_A.slice(5, 7)

type S = {
  past: string[]
  now: string[]
  draft: string
  waiting: boolean
  seconds: number
  stream: string[]
  words: number
}

const base: S = { past: [], now: [], draft: '', waiting: false, seconds: 0, stream: [], words: 0 }
const SCENES: Record<Exclude<Frame, 'loop'>, S> = {
  turn: { ...base, past: PROSE_A.slice(0, 1), now: PROSE_A.slice(1, 3) },
  talk: { ...base, past: PROSE_A.slice(2, 3), now: PROSE_A.slice(3, 13) },
  wait: { ...base, past: PROSE_A.slice(2, 3), now: PROSE_A.slice(3, 13), draft: PROSE_A[13].replace(/^— /, ''), waiting: true, seconds: 12 },
  'inv-native': { ...base, past: PROSE_A.slice(2, 3), now: PROSE_A.slice(3, 17) },
  'inv-html': { ...base, past: PROSE_A.slice(2, 3), now: PROSE_A.slice(3, 17) },
  journal: { ...base, past: PROSE_A.slice(2, 3), now: PROSE_A.slice(3, 17) },
  field: { ...base, past: PROSE_A.slice(3, 13), now: PROSE_A.slice(13, 17) },
}
const loopStart: S = { ...base, past: PROSE_A.slice(1, 3), now: PROSE_A.slice(3, 5) }
const line = (p: string) => (p.startsWith('—') ? 'nv-line' : undefined)
const wordsOf = (lines: string[]) => lines.join(' ').split(' ').length
const loopEnd: S = { ...loopStart, stream: ANSWER, words: wordsOf(ANSWER) }

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('type')
  await a.type('draft', ASK, { interval: 60 })
  await a.wait(500)
  a.mark('send')
  a.put({ draft: ASK, waiting: true, seconds: 0 })
  for (let s = 1; s <= 3; s++) {
    await a.wait(1000)
    a.put({ seconds: s })
  }
  a.mark('answer')
  a.put({ waiting: false, draft: '', stream: ANSWER, words: 0 })
  const total = wordsOf(ANSWER)
  for (let i = 1; i <= total; i++) {
    a.put({ words: i })
    await a.wait(70)
  }
  a.mark('hold')
  await a.wait(3200)
}

function streamed(lines: string[], words: number) {
  const out: string[] = []
  let left = words
  for (const line of lines) {
    if (left <= 0) break
    const parts = line.split(' ')
    out.push(parts.slice(0, left).join(' '))
    left -= parts.length
  }
  return out
}

function Grid({ r0, r1, c0, c1 }: { r0: number; r1: number; c0: number; c1: number }) {
  return (
    <div className="nv-grid">
      {ROWS.slice(r0, r1).map((row, i) => {
        const r = r0 + i
        return (
          <div key={r} className="nv-gridrow">
            {[...row].slice(c0, c1).map((ch, j) => {
              const c = c0 + j
              if (ch !== '@') return ch
              const hero = r === HERO[0] && c === HERO[1]
              return <span key={j} className={hero ? 'nv-hero' : 'nv-npc'}>@</span>
            })}
          </div>
        )
      })}
    </div>
  )
}

function Field({ open, reach = 12 }: { open?: boolean; reach?: number }) {
  return (
    <section className="nv-field" data-open={open || undefined}>
      <div className="nv-panelhead">
        <div className="nv-panelname">Вокруг</div>
        <div className="nv-link">{open ? 'Свернуть' : 'Раскрыть'}</div>
      </div>
      {open ? <Grid r0={0} r1={40} c0={0} c1={76} /> : <Grid r0={HERO[0] - reach} r1={HERO[0] + reach + 1} c0={HERO[1] - 24} c1={HERO[1] + 24} />}
    </section>
  )
}

function Signs() {
  return (
    <div className="nv-signs">
      {SIGNS.map(s => <div key={s.text} className="nv-sign" data-warn={s.warn || undefined}>{s.text}</div>)}
    </div>
  )
}

function People({ talking }: { talking?: boolean }) {
  if (talking) {
    return (
      <section className="nv-card nv-talk">
        <div className="nv-medal">Ж</div>
        <div className="nv-who">
          <div className="nv-name">Жирко</div>
          <div className="nv-role">плотник, хозяин двора</div>
        </div>
      </section>
    )
  }
  return (
    <section className="nv-card nv-people">
      <div className="nv-panelname">Видно</div>
      <div className="nv-person"><span className="nv-name">Жирко</span><span className="nv-role">рядом, нарезает доски</span></div>
      <div className="nv-person"><span className="nv-name">Прокша</span><span className="nv-role">к юго-востоку, с топором</span></div>
    </section>
  )
}

function Prose({ s }: { s: S }) {
  const fresh = s.stream.length ? streamed(s.stream, s.words) : []
  return (
    <div className="nv-prose">
      {s.past.map((p, i) => <p key={'p' + i} className={['nv-past', line(p)].filter(Boolean).join(' ')}>{p}</p>)}
      {s.now.map((p, i) => <p key={'n' + i} className={[fresh.length ? 'nv-past' : '', line(p) ?? ''].join(' ').trim() || undefined}>{p}</p>)}
      {fresh.map((p, i) => <p key={'f' + i} className={line(p)}>{p}</p>)}
    </div>
  )
}

function Input({ s }: { s: S }) {
  return (
    <div className="nv-input" data-waiting={s.waiting || undefined}>
      <div className="nv-inputtext">
        {s.draft ? s.draft : <span className="nv-placeholder">Что делает Федор?</span>}
        {!s.waiting && <span className="nv-caret" />}
      </div>
      <div className="nv-inputmeta">
        {s.waiting
          ? <><Spinner size={14} /><span>Ждём ответа · {s.seconds} с</span><span className="nv-key">Esc — вернуть фразу</span></>
          : <><span>Enter — сделать ход</span><span className="nv-link">Подсказка</span></>}
      </div>
    </div>
  )
}

function Drawer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="nv-drawer">
      <div className="nv-panelhead">
        <div className="nv-drawertitle">{title}</div>
        <div className="nv-link">Закрыть</div>
      </div>
      {children}
    </aside>
  )
}

function InventoryNative() {
  return (
    <div className="nv-native">
      <div className="nv-nativehead"><span>Надето</span><span>Вес: 1.5/45.0 кг</span></div>
      {WORN.map(w => <div key={w} className="nv-nativerow">{w}</div>)}
      <div className="nv-nativehead nv-gap"><span>В руках</span></div>
      <div className="nv-nativerow">кулаки</div>
    </div>
  )
}

function InventoryHtml() {
  return (
    <div className="nv-list">
      <div className="nv-group">Надето</div>
      {WORN.map(w => <div key={w} className="nv-item">{w}</div>)}
      <div className="nv-group">В руках</div>
      <div className="nv-item">кулаки</div>
      <div className="nv-load">
        <div className="nv-loadlabel"><span>Ноша</span><span>1,5 из 45 кг</span></div>
        <div className="nv-meter"><div style={{ width: `${(1.5 / 45) * 100}%` }} /></div>
      </div>
    </div>
  )
}

function Journal() {
  return (
    <div className="nv-journal">
      <div className="nv-subtabs">
        {['Люди', 'Места', 'Слухи', 'Обещания'].map((t, i) => <div key={t} className="nv-subtab" data-on={i === 0 || undefined}>{t}</div>)}
      </div>
      <div className="nv-entry">
        <div className="nv-name">Жирко</div>
        <p>Плотник, хозяин двора. Живёт в избе на своём дворе; тешет из бревна доски и говорит, что работы ещё много.</p>
        <p>Сказал, что живёт на дворе один. Про князя и немецких купцов не знает.</p>
        <p>Топор дать отказался: «ты мне чужой». Учить тесать доски не обещал: «Посмотрим».</p>
      </div>
      <div className="nv-entry">
        <div className="nv-name">Прокша</div>
        <p>Стоял к юго-востоку, в той же стороне, где частокол с открытыми воротами; с плотницким топором в руках, лицом к Федору.</p>
      </div>
    </div>
  )
}

function Screen({ s }: { s: S }) {
  const drawer = FRAME === 'inv-native' || FRAME === 'inv-html' ? 'Ноша' : FRAME === 'journal' ? 'Журнал' : null
  const talking = FRAME !== 'turn'
  return (
    <div className="nv-screen" data-look={LOOK} data-frame={FRAME}>
      <header className="nv-top">
        <div className="nv-context">{CONTEXT.map(c => <span key={c}>{c}</span>)}</div>
        <nav className="nv-tabs">
          {TABS.map(t => <div key={t} className="nv-tab" data-on={t === drawer || undefined}>{t}</div>)}
          {(LOOK === 'flat' || LOOK === 'night') && (
            <div className="nv-theme">
              <div data-on={LOOK === 'flat' || undefined}>День</div>
              <div data-on={LOOK === 'night' || undefined}>Ночь</div>
            </div>
          )}
          <div className="nv-tab nv-menu">Меню</div>
        </nav>
      </header>
      {FRAME === 'field' ? (
        <div className="nv-body nv-body--field">
          <Field open />
          <div className="nv-reader nv-reader--narrow">
            <Signs />
            <Prose s={s} />
            <Input s={s} />
          </div>
        </div>
      ) : (
        <div className="nv-body">
          <div className="nv-reader">
            <Prose s={s} />
            <Input s={s} />
          </div>
          <div className="nv-side">
            <Field reach={drawer ? 5 : 12} />
            <Signs />
            {drawer ? (
              <Drawer title={drawer}>
                {FRAME === 'inv-native' ? <InventoryNative /> : FRAME === 'inv-html' ? <InventoryHtml /> : <Journal />}
              </Drawer>
            ) : <People talking={talking} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default function NovgorodScreen() {
  const theme = LOOK === 'evening' || LOOK === 'night' ? 'dark' : 'light'
  if (FRAME === 'loop') {
    return (
      <Stage width={1600} height={900} unframed theme={theme} initial={loopStart} poster={loopEnd} script={script} play="once" className="nv">
        {s => <Screen s={s} />}
      </Stage>
    )
  }
  const scene = SCENES[FRAME] ?? SCENES.turn
  return (
    <Stage width={1600} height={900} unframed theme={theme} initial={scene} className="nv">
      {s => <Screen s={s} />}
    </Stage>
  )
}
