import { DatabaseConnectionParams, schemaDiff, schemaFromCode, schemaFromDatabase } from '@immich/sql-tools';
import 'src/schema';
import { immich_uuid_v7 } from 'src/schema/functions';
import { describe, expect, it } from 'vitest';

// The medium global setup migrates the `mich` template DB (all upstream + gallery migrations), so its
// live schema is exactly what a freshly-migrated instance boots with. This mirrors
// DatabaseRepository.getSchemaDrift() — the decorator-vs-database check the server runs on startup.
const computeDrift = async () => {
  const source = schemaFromCode({
    overrides: true,
    namingStrategy: 'default',
    uuidFunction: (version) => (version === 7 ? `${immich_uuid_v7.name}()` : 'uuid_generate_v4()'),
  });
  const connection = {
    connectionType: 'url',
    url: process.env.IMMICH_TEST_POSTGRES_URL!,
  } as DatabaseConnectionParams;
  const target = await schemaFromDatabase({ connection });
  return schemaDiff(source, target, {
    tables: { ignoreExtra: true },
    constraints: { ignoreExtra: false },
    indexes: { ignoreExtra: true },
    triggers: { ignoreExtra: true },
    columns: { ignoreExtra: true },
    functions: { ignoreExtra: false },
    parameters: { ignoreExtra: true },
    extensions: { ignoreExtra: true },
  });
};

describe('schema drift', () => {
  // Regression for the face_repair_scan_in_flight_uq override drift: the migration stored the partial
  // index's override with a bare `WHERE "status" IN (...)`, but schemaFromCode emits it parenthesized
  // (`WHERE ("status" IN (...))`), so every boot logged "index missing + extra + override needs update"
  // for this index. 1784000000000-FixFaceRepairScanInFlightIndexOverride reconciles the stored override.
  it('does not report drift for face_repair_scan_in_flight_uq', async () => {
    const drift = await computeDrift();
    const offenders = drift.asHuman().filter((message: string) => message.includes('face_repair_scan_in_flight_uq'));
    expect(offenders).toEqual([]);
  });
});
