/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// ADMS ("iclock") receiver for ZKTeco-family biometric devices (incl. Identix).
//
// When a device is put in "cloud / ADMS server" mode it talks this protocol:
//
//   1. Handshake:  GET  /iclock/cdata?SN=<serial>&options=all&...
//                  -> reply with a plain-text config block.
//   2. Push logs:  POST /iclock/cdata?SN=<serial>&table=ATTLOG
//                  body = one punch per line, TAB-separated:
//                    <user_id>\t<timestamp>\t<status>\t<verify>...
//                  -> reply "OK\n" (or "OK: <n>") or the device retries.
//   3. Get cmds:   GET  /iclock/getrequest?SN=<serial>  -> reply "OK\n"
//
// Whether an *un-acked* punch is retried after the server returns is
// model-dependent — the behaviour to verify against the nightly shutdown
// (plan §C1). We ACK only after a successful DB write, so a device that DOES
// queue will re-deliver anything we failed to persist.
//
// Security: the device cannot authenticate, so we authorize by serial number.
// The serial must exist in `devices` with active = true, and if the
// ADMS_SHARED_SECRET env var is set the request must carry it as ?secret=.
//
// NB: PocketBase runs each route handler in an isolated pooled JS runtime, so
// handlers cannot use module-scope helpers — everything is inline.
// ---------------------------------------------------------------------------

// --- handshake ---------------------------------------------------------------
routerAdd("GET", "/iclock/cdata", (e) => {
  const sn = e.request.url.query().get("SN") || "";
  const body =
    "GET OPTION FROM: " + sn + "\n" +
    "Stamp=0\n" +
    "OpStamp=0\n" +
    "ErrorDelay=30\n" +
    "Delay=30\n" +
    "TransTimes=00:00;14:00\n" +
    "TransInterval=1\n" +
    "TransFlag=1111000000\n" +
    "Realtime=1\n" +
    "Encrypt=0\n";
  return e.string(200, body);
});

// --- command poll (we have no commands to push) ------------------------------
routerAdd("GET", "/iclock/getrequest", (e) => {
  return e.string(200, "OK\n");
});

// --- attendance push ---------------------------------------------------------
routerAdd("POST", "/iclock/cdata", (e) => {
  const query = e.request.url.query();
  const sn = query.get("SN") || "";
  const table = query.get("table") || "";

  // Authorize the device by serial (+ optional shared secret).
  const secretRequired = $os.getenv("ADMS_SHARED_SECRET");
  if (secretRequired && query.get("secret") !== secretRequired) {
    return e.string(401, "unauthorized\n");
  }
  try {
    e.app.findFirstRecordByFilter(
      "devices",
      "serial = {:sn} && active = true",
      { sn: sn }
    );
  } catch (err) {
    return e.string(401, "unknown device\n");
  }

  // Only ATTLOG (attendance) rows create records; ACK everything else so the
  // device does not wedge re-sending operation logs / fingerprint templates.
  if (table !== "ATTLOG") {
    return e.string(200, "OK\n");
  }

  const raw = toString(e.request.body);
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let saved = 0;
  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 2) continue;
    const deviceUserId = cols[0];
    const rawTs = cols[1]; // "YYYY-MM-DD HH:MM:SS"
    // ZKTeco status col: 0/4 = check-in, 1/5 = check-out (model-dependent).
    const statusCode = cols.length >= 3 ? cols[2] : "0";

    // Stable per-punch key so re-delivery never double-counts (unique index).
    const punchId = sn + ":" + deviceUserId + ":" + rawTs;

    // Idempotency: skip if already imported.
    try {
      e.app.findFirstRecordByFilter(
        "attendance_records",
        "device_punch_id = {:pid}",
        { pid: punchId }
      );
      continue; // exists
    } catch (err) {
      // not found -> proceed
    }

    // Map device user id -> employee.
    let employee;
    try {
      employee = e.app.findFirstRecordByFilter(
        "employees",
        "biometric_user_id = {:uid}",
        { uid: deviceUserId }
      );
    } catch (err) {
      // Unknown user — drop this line but keep processing (admin should map it).
      continue;
    }

    const type =
      statusCode === "1" || statusCode === "5" ? "check_out" : "check_in";

    try {
      const col = e.app.findCollectionByNameOrId("attendance_records");
      const rec = new Record(col);
      rec.set("employee", employee.id);
      rec.set("type", type);
      rec.set("timestamp", new DateTime(rawTs));
      rec.set("source", "biometric");
      rec.set("device_punch_id", punchId);
      rec.set("flagged", false);
      e.app.save(rec);
      saved++;
    } catch (err) {
      // A write failure means we must NOT ACK — let the device retry later.
      return e.string(500, "error\n");
    }
  }

  return e.string(200, "OK: " + saved + "\n");
});
