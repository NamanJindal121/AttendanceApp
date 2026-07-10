/// <reference path="../pb_data/types.d.ts" />

// Initial schema for the Attendance app.
// Collections: employees (auth), attendance_records, settings, devices.
migrate((app) => {
  // ---------------------------------------------------------------------------
  // employees (auth collection)
  // ---------------------------------------------------------------------------
  const employees = new Collection({
    type: "auth",
    name: "employees",
    // Only admins manage the roster; employees can read/update their own record.
    listRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)",
    viewRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      {
        name: "full_name",
        type: "text",
        required: true,
        max: 200,
      },
      {
        // Numeric user id stored on the Identix device — the join key for biometric punches.
        name: "biometric_user_id",
        type: "text",
        max: 50,
      },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["employee", "admin"],
      },
      {
        name: "active",
        type: "bool",
      },
    ],
  });
  app.save(employees);

  // ---------------------------------------------------------------------------
  // devices — registry of biometric devices (for ADMS auth + admin visibility)
  // ---------------------------------------------------------------------------
  const devices = new Collection({
    type: "base",
    name: "devices",
    listRule: "@request.auth.role = 'admin'",
    viewRule: "@request.auth.role = 'admin'",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        max: 100,
      },
      {
        // Device serial number reported by ADMS handshake — used to authorize pushes.
        name: "serial",
        type: "text",
        required: true,
        max: 100,
      },
      {
        name: "ip",
        type: "text",
        max: 45,
      },
      {
        name: "active",
        type: "bool",
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_devices_serial ON devices (serial)",
    ],
  });
  app.save(devices);

  // ---------------------------------------------------------------------------
  // settings — single-record geofence configuration
  // ---------------------------------------------------------------------------
  const settings = new Collection({
    type: "base",
    name: "settings",
    // Anyone logged in can read (the PWA needs require_selfie etc.); only admins write.
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      // Coordinates are not `required` because a valid value can be 0, which
      // PocketBase treats as "blank". The hook guards against unconfigured (0,0).
      { name: "office_lat", type: "number" },
      { name: "office_lng", type: "number" },
      { name: "radius_meters", type: "number" },
      { name: "max_gps_accuracy_meters", type: "number" },
      { name: "require_selfie", type: "bool" },
    ],
  });
  app.save(settings);

  // Seed a default settings record so the hook always has config to read.
  const settingsRecord = new Record(settings);
  settingsRecord.set("office_lat", 0);
  settingsRecord.set("office_lng", 0);
  settingsRecord.set("radius_meters", 150);
  settingsRecord.set("max_gps_accuracy_meters", 75);
  settingsRecord.set("require_selfie", false);
  app.save(settingsRecord);

  // ---------------------------------------------------------------------------
  // attendance_records — the unified attendance timeline (biometric + app)
  // ---------------------------------------------------------------------------
  const attendance = new Collection({
    type: "base",
    name: "attendance_records",
    // Employees read only their own; admins read all. Creation is guarded by the
    // create rule (auth required) + validated server-side in pb_hooks/main.pb.js.
    // Biometric records are created by hooks (superuser context), which bypass rules.
    listRule: "@request.auth.role = 'admin' || employee = @request.auth.id",
    viewRule: "@request.auth.role = 'admin' || employee = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      {
        name: "employee",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: employees.id,
        cascadeDelete: false,
      },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["check_in", "check_out"],
      },
      {
        name: "timestamp",
        type: "date",
        required: true,
      },
      {
        name: "source",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["biometric", "app"],
      },
      { name: "lat", type: "number" },
      { name: "lng", type: "number" },
      { name: "gps_accuracy", type: "number" },
      {
        name: "selfie",
        type: "file",
        maxSelect: 1,
        maxSize: 5242880, // 5MB
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      {
        // Stable per-punch key from the device, prevents re-import duplicates.
        name: "device_punch_id",
        type: "text",
        max: 100,
      },
      {
        name: "flagged",
        type: "bool",
      },
    ],
    indexes: [
      "CREATE INDEX idx_attendance_employee_ts ON attendance_records (employee, timestamp)",
      // Uniqueness only enforced when device_punch_id is present (biometric imports).
      "CREATE UNIQUE INDEX idx_attendance_punch ON attendance_records (device_punch_id) WHERE device_punch_id != ''",
    ],
  });
  app.save(attendance);
}, (app) => {
  // Down migration — delete in reverse dependency order.
  const names = ["attendance_records", "settings", "devices", "employees"];
  for (const name of names) {
    try {
      const c = app.findCollectionByNameOrId(name);
      app.delete(c);
    } catch (_) {
      // already gone
    }
  }
});
