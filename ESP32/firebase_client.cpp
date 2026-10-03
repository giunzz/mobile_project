#define ENABLE_USER_AUTH
#define ENABLE_DATABASE

#include "firebase_client.h"
#include "app_config.h"
#include "contract_logic.h"
#include "secrets.h"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>
#include <math.h>
#include <time.h>

static WiFiClientSecure sslClient;
using AsyncClient = AsyncClientClass;
static AsyncClient aClient(sslClient);
static UserAuth userAuth(FIREBASE_API_KEY,
                         FIREBASE_USER_EMAIL,
                         FIREBASE_USER_PASSWORD);
static FirebaseApp fbApp;
static RealtimeDatabase Database;

static uint32_t lastWifiRetryMs = 0;

static String pathOf(const String &suffix) {
  return String(DEVICE_ROOT) + suffix;
}

static void firebaseCallback(AsyncResult &result) {
  if (!result.isResult()) return;

  if (result.isError()) {
    Firebase.printf("[FIREBASE][ERROR] %s (%d)\n",
                    result.error().message().c_str(),
                    result.error().code());
  }

  if (result.isEvent()) {
    Firebase.printf("[FIREBASE][EVENT] %s (%d)\n",
                    result.eventLog().message().c_str(),
                    result.eventLog().code());
  }
}

static bool dbOk() {
  if (aClient.lastError().code() == 0) return true;
  Firebase.printf("[FIREBASE][ERROR] %s (%d)\n",
                  aClient.lastError().message().c_str(),
                  aClient.lastError().code());
  return false;
}

static String dbGetString(const String &path, const String &fallback = "") {
  String value = Database.get<String>(aClient, path);
  return dbOk() ? value : fallback;
}

static int dbGetInt(const String &path, int fallback = 0) {
  int value = Database.get<int>(aClient, path);
  return dbOk() ? value : fallback;
}

static float dbGetFloat(const String &path, float fallback = 0.0f) {
  float value = Database.get<float>(aClient, path);
  return dbOk() ? value : fallback;
}

static bool dbGetBool(const String &path, bool fallback = false) {
  bool value = Database.get<bool>(aClient, path);
  return dbOk() ? value : fallback;
}

static uint64_t dbGetUInt64(const String &path, uint64_t fallback = 0) {
  double value = Database.get<double>(aClient, path);
  return dbOk() ? (uint64_t)value : fallback;
}

static bool dbSetString(const String &path, const String &value) {
  bool ok = Database.set<String>(aClient, path, value);
  return ok && dbOk();
}

static bool dbSetInt(const String &path, int value) {
  bool ok = Database.set<int>(aClient, path, value);
  return ok && dbOk();
}

static bool dbSetBool(const String &path, bool value) {
  bool ok = Database.set<bool>(aClient, path, value);
  return ok && dbOk();
}

static bool dbSetFloat(const String &path, float value, int decimals = 2) {
  bool ok = Database.set<number_t>(aClient, path, number_t(value, decimals));
  return ok && dbOk();
}

static bool dbSetUInt64(const String &path, uint64_t value) {
  bool ok = Database.set<number_t>(aClient, path, number_t((double)value, 0));
  return ok && dbOk();
}

bool firebaseBegin() {
#if !ENABLE_FIREBASE
  return true;
#else
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("[WIFI] Connecting to %s", WIFI_SSID);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    Serial.print(".");
    delay(300);
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI][ERROR] Connection timeout. Firmware will retry in loop().");
  } else {
    Serial.printf("[WIFI] Connected. IP=%s RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  }

  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC,
             "pool.ntp.org", "time.nist.gov");

  sslClient.setInsecure();
  sslClient.setHandshakeTimeout(5);

  initializeApp(aClient, fbApp, getAuth(userAuth),
                firebaseCallback, "authTask");
  fbApp.getApp<RealtimeDatabase>(Database);
  Database.url(FIREBASE_DATABASE_URL);

  Serial.println("[FIREBASE] Authentication started.");
  return true;
#endif
}

void firebaseLoop() {
#if ENABLE_FIREBASE
  if (WiFi.status() != WL_CONNECTED) {
    uint32_t now = millis();
    if (now - lastWifiRetryMs >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiRetryMs = now;
      Serial.println("[WIFI] Reconnecting...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }

  fbApp.loop();
#endif
}

bool firebaseReady() {
#if ENABLE_FIREBASE
  return WiFi.status() == WL_CONNECTED && fbApp.ready();
#else
  return false;
#endif
}

uint64_t currentEpochSeconds() {
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;
  return (uint64_t)now;
}

bool firebaseFetchPendingCommand(FeedCommand &cmd) {
  if (!firebaseReady()) return false;

  String base = pathOf("/command");
  cmd.status = dbGetString(base + "/status", "idle");
  if (cmd.status != "pending") return false;

  cmd.type = dbGetString(base + "/type", "none");
  cmd.speciesId = dbGetString(base + "/speciesId", "none");
  cmd.requestId = dbGetString(base + "/requestId", "");
  cmd.targetGrams = dbGetFloat(base + "/targetGrams", 0.0f);
  cmd.requestedAtEpoch = dbGetUInt64(base + "/requestedAtEpoch", 0);

  return cmd.type == "feed_now";
}

void firebaseRecoverInterruptedCommand(const String &errorCode) {
  if (!firebaseReady()) return;
  const String base = pathOf("/command");
  if (dbGetString(base + "/status", "") != "processing") return;
  const String requestId = dbGetString(base + "/requestId", "");
  if (requestId.length() > 0) {
    firebaseSetCommandStatus(requestId, "failed", -1.0f, errorCode);
  }
}

bool firebaseSetCommandStatus(const String &requestId,
                              const String &status,
                              float actualGrams,
                              const String &errorCode) {
  if (!firebaseReady() || requestId.length() == 0) return false;

  String base = pathOf("/command");
  // Automatic and serial feeds must never acknowledge a manual command.
  if (dbGetString(base + "/requestId", "") != requestId) return false;
  bool ok = dbSetString(base + "/status", status);
  ok &= dbSetString(base + "/errorCode", errorCode);

  if (actualGrams >= 0.0f) {
    ok &= dbSetFloat(base + "/actualGrams", actualGrams);
  }

  uint64_t now = currentEpochSeconds();
  if (status == "completed" || status == "failed") {
    ok &= dbSetUInt64(base + "/completedAtEpoch", now);
  }

  return ok;
}

bool firebaseHasPendingCommand() {
  if (!firebaseReady()) return true;
  const String status = dbGetString(pathOf("/command/status"), "pending");
  return status == "pending" || status == "processing";
}

float firebaseGetPortionGrams(const String &speciesId, float fallback) {
  if (!firebaseReady()) return fallback;

  String p = pathOf("/config/speciesProfiles/" + speciesId + "/portionGrams");
  float value = dbGetFloat(p, fallback);
  return value > 0.0f ? value : fallback;
}

int firebaseGetCooldownMinutes(const String &speciesId, int fallback) {
  if (!firebaseReady()) return fallback;

  String p = pathOf("/config/speciesProfiles/" + speciesId + "/cooldownMinutes");
  int value = dbGetInt(p, fallback);
  return value >= 0 ? value : fallback;
}

float firebaseGetDailyLimitGrams(const String &speciesId) {
  if (!firebaseReady()) return 0.0f;
  const float value = Database.get<float>(
      aClient,
      pathOf("/config/speciesProfiles/" + speciesId + "/dailyLimitGrams"));
  if (!dbOk()) return 0.0f;
  return isfinite(value) && value > 0.0f ? value : 0.0f;
}

bool firebaseGetAutoFeedEnabled(const String &speciesId) {
  if (!firebaseReady()) return false;
  return dbGetBool(pathOf("/config/speciesProfiles/" + speciesId +
                          "/autoFeedEnabled"), false);
}

bool firebaseGetSchedulesJson(const String &speciesId, String &json) {
  if (!firebaseReady()) return false;
  json = Database.get<String>(
      aClient, pathOf("/config/schedules/" + speciesId));
  return dbOk() && json.length() <= MAX_FIREBASE_LIST_BYTES;
}

bool firebaseGetTodayMeasuredGrams(const String &speciesId,
                                   uint64_t dayStartEpoch,
                                   float &grams) {
  grams = 0.0f;
  if (!firebaseReady() || dayStartEpoch == 0) return false;
  DatabaseOptions options;
  options.filter.orderBy("timestampEpoch");
  options.filter.startAt(static_cast<double>(dayStartEpoch));
  options.filter.endAt(static_cast<double>(dayStartEpoch + 86399));
  String history = Database.get<String>(
      aClient, pathOf("/feedingHistory"), options);
  if (!dbOk() || history.length() > MAX_FIREBASE_LIST_BYTES) return false;
  double total = 0;
  if (!sumContractHistoryForDay(history.c_str(), speciesId.c_str(),
                                dayStartEpoch, dayStartEpoch + 86400,
                                total)) return false;
  grams = static_cast<float>(total);
  return isfinite(grams);
}

bool firebaseGetCooldownUntil(const String &speciesId, uint64_t &epoch) {
  epoch = 0;
  if (!firebaseReady()) return false;

  String field = (speciesId == "dog") ? "dogUntilEpoch" : "catUntilEpoch";
  const double value = Database.get<double>(
      aClient, pathOf("/runtime/cooldown/" + field));
  if (!dbOk() || !isfinite(value) || value < 0) return false;
  epoch = static_cast<uint64_t>(value);
  return true;
}

bool firebaseSetCooldownUntil(const String &speciesId, uint64_t epoch) {
  if (!firebaseReady()) return false;

  String field = (speciesId == "dog") ? "dogUntilEpoch" : "catUntilEpoch";
  return dbSetUInt64(pathOf("/runtime/cooldown/" + field), epoch);
}

bool firebaseSetFeedingRuntime(const String &status,
                               const String &speciesId,
                               float targetGrams,
                               float actualGrams,
                               bool ledOn) {
  if (!firebaseReady()) return false;

  String base = pathOf("/runtime/feeding");
  bool ok = dbSetString(base + "/status", status);
  ok &= dbSetString(base + "/activeSpecies", speciesId);
  ok &= dbSetFloat(base + "/targetGrams", targetGrams);
  ok &= dbSetFloat(base + "/actualGrams", actualGrams);
  ok &= dbSetBool(base + "/ledOn", ledOn);
  return ok;
}

bool firebaseSetLatestDetection(const String &speciesId, float confidence) {
  if (!firebaseReady()) return false;

  String base = pathOf("/runtime/latestDetection");
  bool ok = dbSetString(base + "/speciesId", speciesId);
  ok &= dbSetFloat(base + "/confidence", confidence);
  ok &= dbSetUInt64(base + "/capturedAtEpoch", currentEpochSeconds());
  return ok;
}

bool firebasePushHistory(const String &requestId,
                         const String &speciesId,
                         const String &mode,
                         float targetGrams,
                         float actualGrams,
                         const String &result,
                         const String &errorCode) {
  if (!firebaseReady()) return false;

  String json = "{";
  json += "\"requestId\":\"" + requestId + "\",";
  json += "\"speciesId\":\"" + speciesId + "\",";
  json += "\"mode\":\"" + mode + "\",";
  json += "\"targetGrams\":" + String(targetGrams, 2) + ",";
  json += "\"actualGrams\":" + String(actualGrams, 2) + ",";
  json += "\"result\":\"" + result + "\",";
  json += "\"errorCode\":\"" + errorCode + "\",";
  json += "\"timestampEpoch\":" + String((unsigned long long)currentEpochSeconds());
  json += "}";

  String name = Database.push<object_t>(
      aClient,
      pathOf("/feedingHistory"),
      object_t(json));

  if (!dbOk() || name.length() == 0) {
    Serial.println("[FIREBASE][ERROR] Failed to push history.");
    return false;
  }

  Serial.printf("[FIREBASE] History pushed: %s\n", name.c_str());
  return true;
}

void firebaseHeartbeat(const String &errorCode) {
  if (!firebaseReady()) return;

  String base = pathOf("/status");
  dbSetBool(base + "/online", true);
  dbSetString(base + "/firmwareVersion", FIRMWARE_VERSION);
  dbSetString(base + "/ipAddress", WiFi.localIP().toString());
  dbSetInt(base + "/wifiRssi", WiFi.RSSI());
  dbSetUInt64(base + "/lastSeenEpoch", currentEpochSeconds());
  dbSetString(base + "/errorCode", errorCode);
  const bool automatic = firebaseGetAutoFeedEnabled("dog") ||
                         firebaseGetAutoFeedEnabled("cat");
  dbSetString(base + "/operatingMode", automatic ? "automatic" : "manual");
}
