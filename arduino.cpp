#include <ESP8266WiFi.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

// 🔷 WiFi
#define WIFI_SSID "Rohit"
#define WIFI_PASSWORD "11111111"

// 🔷 Firebase
#define FIREBASE_URL "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com"

// 🔷 RFID
#define SS_PIN D2
#define RST_PIN D1
#define BUZZER_PIN D0

MFRC522 mfrc522(SS_PIN, RST_PIN);

String lastUID = "";
unsigned long lastScanTime = 0;

// 🔷 UID Mapping
String getStudentId(String uid) {
  if (uid == "03DFCCFA") return "S001";
  else if (uid == "23A28DD") return "S002";
  return "";
}

// 🔷 Time
String getTime() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  char buffer[10];
  sprintf(buffer, "%02d:%02d", t->tm_hour, t->tm_min);
  return String(buffer);
}

// 🔷 Date
String getDate() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  char buffer[15];
  sprintf(buffer, "%04d-%02d-%02d", t->tm_year + 1900, t->tm_mon + 1, t->tm_mday);
  return String(buffer);
}

void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected");

  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");

  while (time(nullptr) < 100000) {
    Serial.println("Waiting for time sync...");
    delay(1000);
  }

  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);

  Serial.println("Scan RFID card...");
}

void loop() {

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) return;

  // 🔷 Read UID
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  if (uid == lastUID && millis() - lastScanTime < 3000) return;

  lastUID = uid;
  lastScanTime = millis();

  Serial.println("UID: " + uid);

  String studentId = getStudentId(uid);

  if (studentId == "") {
    Serial.println("Unknown card");
    digitalWrite(BUZZER_PIN, HIGH);
    delay(600);
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }

  Serial.println("Student ID: " + studentId);

  // 🔷 Fetch active session
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String sessionUrl = String(FIREBASE_URL) + "/activeSession.json";

  https.begin(client, sessionUrl);
  int code = https.GET();

  if (code <= 0) {
    Serial.println("Session fetch failed");
    return;
  }

  String payload = https.getString();
  https.end();

  if (payload == "null" || payload == "") {
    Serial.println("No active session");
    return;
  }

  // 🔷 Extract subject
  String subject = "";
  Serial.println(subject);
  int sIndex = payload.indexOf("subject");

  if (sIndex != -1) {
    int start = payload.indexOf("\"", payload.indexOf(":", sIndex)) + 1;
    int end = payload.indexOf("\"", start);
    subject = payload.substring(start, end);
  }

  // 🔷 Extract status
  String status = "";
  int statusIndex = payload.indexOf("status");

  if (statusIndex != -1) {
    int start = payload.indexOf("\"", payload.indexOf(":", statusIndex)) + 1;
    int end = payload.indexOf("\"", start);
    status = payload.substring(start, end);
  }

  // 🔷 Extract sessionId
    String sessionId = "";
    int idIndex = payload.indexOf("sessionId");

    if (idIndex != -1) {
      int start = payload.indexOf(":", idIndex) + 1;
      int end = payload.indexOf(",", start);
      if (end == -1) end = payload.indexOf("}", start);

      sessionId = payload.substring(start, end);
      sessionId.trim();
    }

    // ✅ ADD DEBUG HERE
    Serial.println("------ SESSION DEBUG ------");
    Serial.println("Fetched Subject: " + subject);
    Serial.println("Fetched Status: " + status);
    Serial.println("Fetched SessionID: " + sessionId);
    Serial.println("---------------------------");


    // 🔴 EXISTING CHECK
    if (status != "active") {
      Serial.println("Session not active");
      return;
    }
  if (subject == "" || sessionId == "") {
    Serial.println("Session data missing");
    return;
  }

  String date = getDate();
  String timeNow = getTime();

  Serial.println("Subject: " + subject);
  Serial.println("Session ID: " + sessionId);
  Serial.println("Date: " + date);
  Serial.println("Time: " + timeNow);

  // 🔥 SESSION-BASED PATH
  String sessionKey = date + "_" + sessionId;

  String url = String(FIREBASE_URL) + "/attendance/" + subject + "/" + sessionKey + "/" + studentId + ".json";

  // 🔷 Check duplicate
  https.begin(client, url);
  https.GET();
  String existing = https.getString();
  https.end();

  if (existing != "null") {
    Serial.println("Already marked in this session");
    digitalWrite(BUZZER_PIN, HIGH);
    delay(800);
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }

  // 🔷 Write attendance
  String jsonData = "{\"status\":\"present\",\"time\":\"" + timeNow + "\"}";

  https.begin(client, url);
  int writeCode = https.PUT(jsonData);
  https.end();

  Serial.print("HTTP Code: ");
  Serial.println(writeCode);

  if (writeCode == 200) {
    Serial.println("Attendance SUCCESS");
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    Serial.println("Write FAILED");
  }

  delay(1000);
}