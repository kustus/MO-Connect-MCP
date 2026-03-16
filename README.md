# MonKey Office MCP Server

MCP Server für die **MonKey Office Connect JSON-API**.
Verbindet die Claude Desktop App mit MonKey Office, um Buchhaltungsdaten direkt abzufragen.

```
Claude Desktop App (Mac/PC)
        ↕  Streamable HTTP / SSE
Docker Container: monkey-office-mcp (z.B. auf NAS oder Server)
        ↕  HTTP/JSON
MonKey Office Connect (z.B. 192.168.178.53:8084)
        ↕
MonKey Office Datenbank
```

---

## Voraussetzungen

### 1. MonKey Office mit Connect-Modul

- **MonKey Office** muss installiert und gestartet sein
- Das **Connect-Modul** (JSON-API) muss lizenziert und aktiviert sein
- Die Connect-API ist standardmäßig unter `http://<MO-Rechner-IP>:8084/monkeyOfficeConnectJSON` erreichbar

### 2. API-Benutzer in MonKey Office anlegen

> **Wichtig:** Admin-User können sich **nicht** über die API anmelden!

1. In MonKey Office unter **Verwaltung → Benutzer** einen neuen Benutzer anlegen
2. Benutzername und Passwort notieren (z.B. `KI` / `MeinPasswort`)
3. Dem Benutzer die nötigen Rechte für die gewünschten Module geben

### 3. Docker-Umgebung

Der MCP-Server läuft als Docker Container. Du brauchst:
- Einen Rechner/NAS mit **Docker** und **Docker Compose** (z.B. QNAP Container Station, Synology, Linux-Server)
- Netzwerkzugriff vom Docker-Host auf den MonKey Office Rechner (Port 8084)
- Netzwerkzugriff von deinem Mac/PC auf den Docker-Host (Port 3000)

### 4. Claude Desktop App

- **Claude Desktop** installiert auf Mac oder Windows
- **Node.js** (>= 18) auf dem Mac/PC installiert (wird für `mcp-remote` benötigt)

---

## Installation

### Schritt 1: Firma-ID ermitteln

Bevor der Container gestartet wird, brauchst du die `Firma_ID` aus MonKey Office.
Führe das einmalig von einem Rechner mit Netzwerkzugriff aus:

```bash
curl -X POST http://<MO-RECHNER-IP>:8084/monkeyOfficeConnectJSON \
  -H 'Content-Type: application/json' \
  -u 'DEIN_API_USER:DEIN_API_PASSWORT' \
  -d '{"firmaList":""}'
```

Die Antwort enthält eine oder mehrere Firmen mit `Firma_ID`:

```json
{
  "firmaListResponse": {
    "ReturnData": {
      "FirmaListItem": [
        {
          "Firma_ID": "4F01644397CE0566C14298B4",
          "Bezeichnung": "Meine Firma GmbH"
        }
      ]
    }
  }
}
```

Notiere die `Firma_ID` der gewünschten Firma.

### Schritt 2: Docker Container einrichten

#### Option A: Auf einem NAS/Server mit SSH

```bash
# Verzeichnis anlegen
mkdir -p /share/Container/monkey-office-mcp
cd /share/Container/monkey-office-mcp

# Dateien herunterladen
# (falls git verfügbar:)
git clone https://github.com/kustus/MO-Connect-MCP.git .

# (falls kein git: Dateien manuell kopieren – benötigt werden:
#  Dockerfile, index.js, package.json, docker-compose.yml)
```

#### Option B: QNAP Container Station GUI

1. Container Station öffnen → **"Anwendung erstellen"**
2. **"Aus docker-compose erstellen"** wählen
3. Den Inhalt der `docker-compose.yml` (siehe unten) einfügen
4. Erstellen klicken

### Schritt 3: docker-compose.yml konfigurieren

Trage deine Zugangsdaten in die `docker-compose.yml` ein:

```yaml
services:
  monkey-office-mcp:
    build: .
    container_name: monkey-office-mcp
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # URL zur MonKey Office Connect API
      MO_URL:       "http://<MO-RECHNER-IP>:8084/monkeyOfficeConnectJSON"
      # API-Benutzer (kein Admin!)
      MO_USER:      "DEIN_API_USER"
      MO_PASS:      "DEIN_API_PASSWORT"
      # Firma-ID aus Schritt 1
      MO_FIRMA_KEY: "DEINE_FIRMA_ID"
      PORT:         "3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Schritt 4: Container starten

```bash
docker compose up -d --build
```

### Schritt 5: Prüfen ob der Server läuft

```bash
curl http://<DOCKER-HOST>:3000/health
```

Erwartete Antwort:

```json
{
  "status": "ok",
  "service": "monkey-office-mcp",
  "version": "1.0.0",
  "firma_key_set": true
}
```

---

## Claude Desktop konfigurieren

### Konfigurationsdatei öffnen

| OS      | Pfad                                                               |
|---------|--------------------------------------------------------------------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json`  |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                      |

### MCP-Server eintragen

Der Server wird über `mcp-remote` angebunden, das die Verbindung zwischen Claude Desktop (stdio) und dem Remote-Server (Streamable HTTP) herstellt:

```json
{
  "mcpServers": {
    "monkey-office": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://<DOCKER-HOST>:3000/mcp",
        "--allow-http"
      ]
    }
  }
}
```

> **Hinweis:** Ersetze `<DOCKER-HOST>` durch den Hostnamen oder die IP-Adresse deines NAS/Servers (z.B. `192.168.178.100` oder `mein-nas`).

> **`--allow-http`** ist nötig, weil `mcp-remote` standardmäßig nur HTTPS-Verbindungen erlaubt. Im lokalen LAN ist HTTP ausreichend.

### Claude Desktop neu starten

Nach dem Speichern der Konfiguration Claude Desktop **komplett beenden und neu starten**.
Unter **Einstellungen → Entwickler** sollte der Server `monkey-office` als verbunden angezeigt werden.

---

## Testen

In Claude Desktop einfach fragen:

- *"Welche Firmen sind in MonKey Office verfügbar?"*
- *"Zeig mir alle Buchungen von Januar bis März 2026"*
- *"Suche Buchungen für Wüstenrot"*
- *"Zeig mir alle Buchungen auf Konto 4000"*
- *"Welche Kunden haben wir?"*
- *"Zeig mir die Steuersätze"*
- *"Welche Kostenstellen gibt es?"*

---

## Verfügbare Tools

### Immer verfügbar

| Tool                 | Beschreibung                                                       |
|----------------------|--------------------------------------------------------------------|
| `firma_list`         | Alle Firmen/Mandanten auflisten (liefert Firma_ID)                |
| `firma_get`          | Firmendetails: Name, Adresse, Steuernummer, Kontenplan            |
| `buchung_list`       | Buchungsjournal filtern nach Zeitraum, Konto, Kostenstelle, Text  |
| `buchung_get`        | Einzelbuchung mit allen Journalzeilen                             |
| `adresse_list`       | Kunden und Lieferanten suchen                                     |
| `adresse_get`        | Vollständige Adressdetails                                        |
| `steuersatz_list`    | Alle Steuersätze der Firma                                        |
| `kostenstellen_list` | Alle Kostenstellen der Firma                                       |

### Abhängig von Lizenz/Modulen

Diese Tools sind implementiert, funktionieren aber nur wenn das entsprechende MonKey Office Modul lizenziert und aktiviert ist:

| Tool                 | Benötigtes Modul          | Beschreibung                        |
|----------------------|---------------------------|-------------------------------------|
| `verkaufbeleg_list`  | Faktura                   | Rechnungen, Angebote, Gutschriften |
| `verkaufbeleg_get`   | Faktura                   | Belegdetails mit Positionen        |
| `einkaufbeleg_list`  | Faktura                   | Eingangsrechnungen, Bestellungen   |
| `buchung_konto_list` | Erweiterte Buchhaltung    | Kontenplan auflisten               |
| `offene_posten_list` | Erweiterte Buchhaltung    | Offene Forderungen/Verbindlichkeiten|
| `debitor_list`       | Erweiterte Buchhaltung    | Debitorenkonten mit Salden         |
| `kreditor_list`      | Erweiterte Buchhaltung    | Kreditorenkonten mit Salden        |
| `artikel_list`       | Faktura                   | Artikel und Leistungen             |
| `projekt_list`       | Projektverwaltung         | Projekte auflisten                 |

> Falls ein Modul nicht lizenziert ist, gibt die API den Fehler *"Funktion nicht implementiert"* zurück.

---

## Fehlerbehebung

### Server "disconnected" in Claude Desktop

1. Prüfe ob der Container läuft: `curl http://<DOCKER-HOST>:3000/health`
2. Prüfe ob `mcp-remote` funktioniert: `npx -y mcp-remote http://<DOCKER-HOST>:3000/mcp --allow-http`
3. Stelle sicher, dass `--allow-http` in der Config steht (nötig für HTTP im LAN)
4. Stelle sicher, dass Node.js >= 18 installiert ist: `node --version`

### Leere Ergebnisse bei Verkaufsbelegen

Wenn `verkaufbeleg_list` keine Daten zurückgibt, obwohl Rechnungen existieren: Die Rechnungen wurden möglicherweise direkt in der Buchhaltung erfasst (als Buchungen) und nicht über das Faktura-Modul erstellt. Nutze `buchung_list` mit `suchtext` um sie zu finden.

### "Funktion nicht implementiert"

Diese Meldung kommt von der MonKey Office API, nicht vom MCP-Server. Das benötigte Modul ist in eurer MonKey Office Lizenz nicht enthalten oder nicht aktiviert.

### Container-Logs anzeigen

```bash
docker logs monkey-office-mcp -f
```

---

## Updates einspielen

```bash
cd /share/Container/monkey-office-mcp
git pull
docker compose up -d --build
```

---

## Technische Details

- **Transport**: Streamable HTTP (`/mcp`) + SSE-Fallback (`/sse`)
- **Runtime**: Node.js 20 Alpine (Docker)
- **API-Protokoll**: MonKey Office Connect JSON-API (HTTP POST)
- **Authentifizierung**: HTTP Basic Auth gegen MonKey Office, Firma-Auswahl via `mbl-ident` Header
- **Abhängigkeiten**: `@modelcontextprotocol/sdk`, `express`
