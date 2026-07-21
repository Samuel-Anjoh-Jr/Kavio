import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

/**
 * A JSON scalar.
 *
 * Defined here rather than pulled from a package: the published JSON-scalar
 * libraries either cap their graphql peer range below the version this workspace
 * runs, or add a dependency for thirty lines of code. Keeping it local also
 * keeps it honest about what it accepts.
 *
 * Used ONLY for onboarding's in-progress answers, whose step shapes are still
 * moving. Everything with a settled shape gets a real GraphQL type — this is not
 * an invitation to return blobs.
 */

function parseLiteral(node: ValueNode, variables?: Record<string, unknown> | null): unknown {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return node.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {};
      for (const field of node.fields) {
        value[field.name.value] = parseLiteral(field.value, variables);
      }
      return value;
    }
    case Kind.LIST:
      return node.values.map((value) => parseLiteral(value, variables));
    case Kind.NULL:
      return null;
    case Kind.VARIABLE:
      return variables?.[node.name.value];
    default:
      // ENUM and anything added to the AST later. Returning undefined rather
      // than guessing keeps an unknown literal from silently becoming a string.
      return undefined;
  }
}

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description:
    'Arbitrary JSON. Used for onboarding step answers, whose shape is still evolving.',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral,
});
