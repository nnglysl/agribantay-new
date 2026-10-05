#include <Arduino.h>
#include <DHT.h>

// =====================================================
// AGRIBANTAY - DEVICE 1
// Production IoT Firmware
// =====================================================

// ---------------- SENSOR PINS ----------------
#define DHT_PIN 4
#define DHT_TYPE DHT22

#define SOIL_PIN 34
#define MQ137_PIN 35

// ---------------- A7670C PINS ----------------
#define MODEM_RX 16   // ESP32 RX2 <- A7670C TXD2
#define MODEM_TX 17   // ESP32 TX2 -> A7670C RXD2

// ---------------- DEVICE ID ----------------
const char* DEVICE_KEY = "AGB-XXXXXXXX";   // <-- palitan ng key mula sa inventory. HUWAG i-commit ang totoo.

// ---------------- API ----------------
const char* API_URL =
  "http://agribantay.com/api/sensor-readings";

// ---------------- TIMING ----------------

// Send sensor data every 60 seconds
const unsigned long SEND_INTERVAL = 60000;

// Maximum HTTP retries per reading
const int MAX_RETRIES = 3;

// =====================================================
// OBJECTS
// =====================================================

HardwareSerial modem(2);
DHT dht(DHT_PIN, DHT_TYPE);

// =====================================================
// SEND AT COMMAND
// =====================================================

bool sendAT(
  String command,
  String expected,
  unsigned long timeout = 5000
)
{
  Serial.println();
  Serial.println(">> " + command);

  modem.println(command);

  unsigned long start = millis();
  String response = "";

  while (millis() - start < timeout)
  {
    while (modem.available())
    {
      char c = modem.read();

      Serial.write(c);
      response += c;

      if (response.indexOf(expected) >= 0)
      {
        return true;
      }
    }

    delay(10);
  }

  return false;
}

// =====================================================
// READ MODEM RESPONSE
// =====================================================

String readModemResponse(unsigned long timeout)
{
  String response = "";

  unsigned long start = millis();

  while (millis() - start < timeout)
  {
    while (modem.available())
    {
      char c = modem.read();

      Serial.write(c);
      response += c;
    }

    delay(10);
  }

  return response;
}

// =====================================================
// CHECK NETWORK
// =====================================================

bool checkNetwork()
{
  Serial.println();
  Serial.println("Checking network...");

  modem.println("AT+CGATT?");

  String response = readModemResponse(3000);

  if (response.indexOf("+CGATT: 1") >= 0)
  {
    Serial.println("Packet data: CONNECTED");
    return true;
  }

  Serial.println("Packet data: NOT CONNECTED");

  return false;
}

// =====================================================
// INITIALIZE HTTP
// =====================================================

bool initializeHTTP()
{
  Serial.println();
  Serial.println("Initializing HTTP...");

  // Clean up previous HTTP session
  modem.println("AT+HTTPTERM");

  delay(1000);

  while (modem.available())
  {
    Serial.write(modem.read());
  }

  // Start HTTP
  if (!sendAT(
        "AT+HTTPINIT",
        "OK",
        5000))
  {
    Serial.println("HTTPINIT failed.");
    return false;
  }

  // Set URL
  String urlCommand =
    "AT+HTTPPARA=\"URL\",\"" +
    String(API_URL) +
    "\"";

  if (!sendAT(
        urlCommand,
        "OK",
        5000))
  {
    Serial.println("Failed to set API URL.");
    return false;
  }

  // Set content type
  if (!sendAT(
        "AT+HTTPPARA=\"CONTENT\",\"application/json\"",
        "OK",
        5000))
  {
    Serial.println("Failed to set content type.");
    return false;
  }

  Serial.println("HTTP initialized successfully.");

  return true;
}

// =====================================================
// SEND JSON USING HTTPDATA
// =====================================================

bool sendJSON(String json)
{
  Serial.println();
  Serial.println("---------------------------------");
  Serial.println("Preparing HTTP DATA");
  Serial.println("---------------------------------");

  Serial.println(
    "JSON Length: " +
    String(json.length())
  );

  String dataCommand =
    "AT+HTTPDATA=" +
    String(json.length()) +
    ",10000";

  Serial.println();
  Serial.println(">> " + dataCommand);

  modem.println(dataCommand);

  // Wait for DOWNLOAD
  String response = "";

  unsigned long start = millis();

  while (millis() - start < 5000)
  {
    while (modem.available())
    {
      char c = modem.read();

      Serial.write(c);
      response += c;
    }

    if (
      response.indexOf("DOWNLOAD") >= 0 ||
      response.indexOf("OK") >= 0
    )
    {
      break;
    }

    delay(10);
  }

  if (
    response.indexOf("DOWNLOAD") < 0 &&
    response.indexOf("OK") < 0
  )
  {
    Serial.println();
    Serial.println(
      "ERROR: A7670C did not accept HTTPDATA."
    );

    return false;
  }

  // Send JSON
  Serial.println();
  Serial.println("Sending JSON to A7670C...");

  modem.print(json);

  delay(1500);

  while (modem.available())
  {
    Serial.write(modem.read());
  }

  return true;
}

// =====================================================
// PERFORM HTTP POST
// =====================================================

bool performPOST()
{
  Serial.println();
  Serial.println("=================================");
  Serial.println("       SENDING HTTP POST");
  Serial.println("=================================");

  modem.println("AT+HTTPACTION=1");

  String response = "";

  unsigned long start = millis();

  // Wait for HTTPACTION result
  while (millis() - start < 30000)
  {
    while (modem.available())
    {
      char c = modem.read();

      Serial.write(c);
      response += c;
    }

    if (response.indexOf("+HTTPACTION:") >= 0)
    {
      break;
    }

    delay(10);
  }

  Serial.println();

  // HTTP 200
  if (response.indexOf("+HTTPACTION: 1,200") >= 0)
  {
    Serial.println(
      "HTTP POST SUCCESS - 200 OK"
    );

    Serial.println();
    Serial.println("Reading server response...");

    modem.println("AT+HTTPREAD");

    delay(3000);

    while (modem.available())
    {
      Serial.write(modem.read());
    }

    return true;
  }

  // HTTP 201
  if (response.indexOf("+HTTPACTION: 1,201") >= 0)
  {
    Serial.println(
      "HTTP POST SUCCESS - 201 Created"
    );

    Serial.println();
    Serial.println("Reading server response...");

    modem.println("AT+HTTPREAD");

    delay(3000);

    while (modem.available())
    {
      Serial.write(modem.read());
    }

    return true;
  }

  Serial.println();
  Serial.println("HTTP POST FAILED.");

  Serial.println("Response:");
  Serial.println(response);

  return false;
}

// =====================================================
// SEND SENSOR READING
// =====================================================

bool sendSensorReading(
  float temperature,
  float humidity,
  int soilRaw,
  int ammoniaRaw
)
{
  // Build JSON
  String json =
    "{\"device_key\":\"" +
    String(DEVICE_KEY) +
    "\",\"ammonia_raw\":" +
    String(ammoniaRaw) +
    ",\"temperature\":" +
    String(temperature, 2) +
    ",\"humidity\":" +
    String(humidity, 2) +
    ",\"soil_raw\":" +
    String(soilRaw) +
    "}";

  Serial.println();
  Serial.println("---------------------------------");
  Serial.println("SENSOR DATA");
  Serial.println("---------------------------------");

  Serial.println(
    "Temperature : " +
    String(temperature, 2) +
    " C"
  );

  Serial.println(
    "Humidity    : " +
    String(humidity, 2) +
    " %"
  );

  Serial.println(
    "Soil Raw    : " +
    String(soilRaw)
  );

  Serial.println(
    "MQ-137 Raw  : " +
    String(ammoniaRaw)
  );

  Serial.println();
  Serial.println("JSON:");
  Serial.println(json);

  // Retry transmission
  for (
    int attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  )
  {
    Serial.println();
    Serial.println(
      "HTTP ATTEMPT " +
      String(attempt) +
      " OF " +
      String(MAX_RETRIES)
    );

    // Reinitialize HTTP
    if (!initializeHTTP())
    {
      Serial.println(
        "HTTP initialization failed."
      );

      delay(3000);
      continue;
    }

    // Send JSON
    if (!sendJSON(json))
    {
      Serial.println(
        "Failed to send JSON."
      );

      modem.println("AT+HTTPTERM");

      delay(1000);

      continue;
    }

    // Perform POST
    if (performPOST())
    {
      Serial.println();
      Serial.println("=================================");
      Serial.println("      DATA SENT SUCCESSFULLY");
      Serial.println("=================================");

      modem.println("AT+HTTPTERM");

      delay(1000);

      while (modem.available())
      {
        Serial.write(modem.read());
      }

      return true;
    }

    Serial.println();
    Serial.println(
      "POST failed. Retrying..."
    );

    modem.println("AT+HTTPTERM");

    delay(2000);
  }

  Serial.println();
  Serial.println("=================================");
  Serial.println("       DATA SEND FAILED");
  Serial.println("=================================");

  return false;
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  delay(2000);

  // -------------------------------
  // ESP32 ADC
  // -------------------------------

  analogReadResolution(12);

  analogSetPinAttenuation(
    SOIL_PIN,
    ADC_11db
  );

  analogSetPinAttenuation(
    MQ137_PIN,
    ADC_11db
  );

  // -------------------------------
  // DHT22
  // -------------------------------

  dht.begin();

  // -------------------------------
  // A7670C UART2
  // -------------------------------

  modem.begin(
    115200,
    SERIAL_8N1,
    MODEM_RX,
    MODEM_TX
  );

  delay(3000);

  Serial.println();
  Serial.println("=================================");
  Serial.println("     AGRIBANTAY - DEVICE 1");
  Serial.println("     PRODUCTION FIRMWARE");
  Serial.println("=================================");

  Serial.println();

  Serial.println(
    "Device Key: " +
    String(DEVICE_KEY)
  );

  Serial.println(
    "API: " +
    String(API_URL)
  );

  // -------------------------------
  // MODEM CHECK
  // -------------------------------

  Serial.println();
  Serial.println("Checking A7670C...");

  if (!sendAT(
        "AT",
        "OK",
        5000))
  {
    Serial.println();
    Serial.println(
      "WARNING: A7670C did not respond."
    );
  }
  else
  {
    Serial.println();
    Serial.println("A7670C OK.");
  }

  // -------------------------------
  // SIM CHECK
  // -------------------------------

  sendAT(
    "AT+CPIN?",
    "READY",
    5000
  );

  // -------------------------------
  // NETWORK CHECK
  // -------------------------------

  if (!checkNetwork())
  {
    Serial.println();
    Serial.println(
      "WARNING: Packet data is not currently attached."
    );

    Serial.println(
      "The device will continue and retry later."
    );
  }

  // -------------------------------
  // GET IP
  // -------------------------------

  sendAT(
    "AT+CGPADDR",
    "OK",
    5000
  );

  Serial.println();
  Serial.println("=================================");
  Serial.println("       DEVICE 1 READY");
  Serial.println("=================================");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop()
{
  static unsigned long lastSend = 0;

  // Send immediately on first run
  if (
    lastSend == 0 ||
    millis() - lastSend >= SEND_INTERVAL
  )
  {
    lastSend = millis();

    Serial.println();
    Serial.println();
    Serial.println("=================================");
    Serial.println("       NEW SENSOR READING");
    Serial.println("=================================");

    // -------------------------------
    // READ DHT22
    // -------------------------------

    float temperature =
      dht.readTemperature();

    float humidity =
      dht.readHumidity();

    // -------------------------------
    // READ SOIL SENSOR
    // -------------------------------

    int soilRaw =
      analogRead(SOIL_PIN);

    // -------------------------------
    // READ MQ-137
    // -------------------------------

    int ammoniaRaw =
      analogRead(MQ137_PIN);

    // -------------------------------
    // CHECK DHT22
    // -------------------------------

    if (
      isnan(temperature) ||
      isnan(humidity)
    )
    {
      Serial.println();
      Serial.println("DHT22 ERROR.");

      Serial.println(
        "Reading will not be sent."
      );

      return;
    }

    // -------------------------------
    // CHECK NETWORK
    // -------------------------------

    if (!checkNetwork())
    {
      Serial.println();
      Serial.println(
        "Network unavailable."
      );

      Serial.println(
        "Skipping this reading."
      );

      return;
    }

    // -------------------------------
    // SEND TO AGRIBANTAY
    // -------------------------------

    sendSensorReading(
      temperature,
      humidity,
      soilRaw,
      ammoniaRaw
    );

    Serial.println();
    Serial.println("---------------------------------");
    Serial.println(
      "Next transmission in 60 seconds."
    );
    Serial.println("---------------------------------");
  }

  delay(100);
}