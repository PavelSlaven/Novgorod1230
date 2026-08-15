const SCHEMA_NAME = 'portrait_spec_v1';

export const PORTRAIT_SPEC_V1_ENUMS = deepFreeze({
  person: {
    sex: ['male', 'female'],
    age: ['young', 'adult', 'middle_aged', 'old'],
    build: ['slim', 'average', 'stocky'],
    skin_tone: ['pale', 'light', 'warm', 'brown'],
    face_shape: ['oval', 'round', 'broad', 'angular', 'long']
  },
  hair: {
    color: ['blond', 'light_brown', 'dark_brown', 'black', 'auburn', 'gray', 'white'],
    length: ['bald', 'short', 'medium', 'long'],
    style: ['straight', 'wavy', 'loose', 'braided'],
    facial_hair: ['none', 'moustache', 'short_beard', 'full_beard']
  },
  eyes: {
    color: ['blue', 'gray', 'green', 'brown', 'dark'],
    gaze: ['viewer', 'left', 'right', 'down']
  },
  expression: {
    emotion: [
      'neutral', 'calm', 'happy', 'sad', 'angry', 'afraid',
      'suspicious', 'tired', 'surprised'
    ],
    intensity: ['low', 'medium', 'high']
  },
  clothing: {
    neckline: ['round', 'slit_round', 'v_slit', 'high_closed'],
    sleeve: ['narrow', 'wide'],
    outer: [
      'none', 'wrap', 'front_open', 'shoulder_drape',
      'sleeveless_overlayer'
    ],
    fabric: ['light_linen', 'wool', 'coarse_wool', 'furred'],
    trim: ['none', 'edge_band', 'braid', 'fur_edge'],
    main_color: [
      'undyed_linen', 'dark_blue', 'forest_green', 'madder_red',
      'ochre', 'brown', 'charcoal'
    ],
    secondary_color: [
      'undyed_linen', 'dark_blue', 'forest_green', 'madder_red',
      'ochre', 'brown', 'charcoal'
    ],
    headwear: ['none', 'linen_cap', 'headscarf', 'fur_hat']
  },
  pose: {
    body: ['frontal', 'three_quarter'],
    head: ['straight', 'slightly_turned', 'tilted']
  },
  background: ['neutral', 'parchment', 'warm', 'cool']
});

export const PORTRAIT_SPEC_V1_JSON_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SCHEMA_NAME,
  title: 'Portrait specification v1',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'person', 'hair', 'eyes', 'expression', 'clothing', 'pose', 'background'],
  properties: {
    schema: { type: 'string', const: SCHEMA_NAME },
    person: objectSchema(PORTRAIT_SPEC_V1_ENUMS.person),
    hair: objectSchema(PORTRAIT_SPEC_V1_ENUMS.hair),
    eyes: objectSchema(PORTRAIT_SPEC_V1_ENUMS.eyes),
    expression: objectSchema(PORTRAIT_SPEC_V1_ENUMS.expression),
    clothing: objectSchema(PORTRAIT_SPEC_V1_ENUMS.clothing),
    pose: objectSchema(PORTRAIT_SPEC_V1_ENUMS.pose),
    background: enumSchema(PORTRAIT_SPEC_V1_ENUMS.background)
  }
});

export function validatePortraitSpecV1(value) {
  const errors = [];
  validateNode(value, PORTRAIT_SPEC_V1_JSON_SCHEMA, '', errors);
  return Object.freeze(errors.map((error) => Object.freeze(error)));
}

export function assertPortraitSpecV1(value) {
  const errors = validatePortraitSpecV1(value);
  if (errors.length === 0) return value;
  const error = new TypeError(formatPortraitSpecV1Errors(errors));
  error.name = 'PortraitSpecValidationError';
  error.code = 'PORTRAIT_SPEC_INVALID';
  error.validationErrors = errors;
  throw error;
}

export function formatPortraitSpecV1Errors(errors) {
  return (errors ?? []).map((error) => error.message).join('\n');
}

function objectSchema(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, values]) => [name, enumSchema(values)])
    )
  };
}

function enumSchema(values) {
  return { type: 'string', enum: values };
}

function validateNode(value, schema, path, errors) {
  const label = path || 'portrait';
  if (schema.type === 'object') {
    if (!plainObject(value)) {
      errors.push(issue(path, 'type', `${label} must be an object.`));
      return;
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(issue(joinPath(path, required), 'required', `${joinPath(path, required)} is required.`));
      }
    }
    for (const [name, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[name];
      const childPath = joinPath(path, name);
      if (!childSchema) {
        if (schema.additionalProperties === false) {
          errors.push(issue(childPath, 'additional_property', `${childPath} is not allowed.`));
        }
        continue;
      }
      validateNode(child, childSchema, childPath, errors);
    }
    return;
  }

  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(issue(path, 'type', `${label} must be a string.`));
    return;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(issue(path, 'const', `${label} must equal ${schema.const}.`));
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(issue(path, 'enum', `${label} must be one of: ${schema.enum.join(', ')}.`));
  }
}

function issue(path, code, message) {
  return { path: path || '$', code, message };
}

function joinPath(parent, child) {
  return parent ? `${parent}.${child}` : child;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
