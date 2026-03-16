# MonKey Office MCP Server

MCP Server für die MonKey Office Connect JSON-API.  
Läuft als Docker Container auf einem QNAP NAS und verbindet die **Claude Desktop App** mit MonKey Office.

```
Claude Desktop App (Mac/PC im LAN)
        ↕  HTTP/SSE  →  http://ac-nas1:3000/sse
QNAP NAS – Docker Container: monkey-office-mcp
        ↕  HTTP/JSON
MonKey Office Connect  (192.168.178.53:8084)
        ↕
MonKey Office Datenbank
```

---

## 1. Einmaliger Setup: Firma-ID ermitteln

Bevor du alles einrichtest, brauchst du die `Firma_ID` aus MonKey Office.  
Führe das einmalig von deinem PC aus:

```bash
curl -X POST http://192.168.178.53:8084/monkeyOfficeConnectJSON \
  -H 'Content-Type: application/json' \
  -u 'API_USER:API_PASSWORT' \
  -d '{"firmaList":""}'
```

Die `Firma_ID` aus der Antwort brauchst du gleich in Schritt 3.

> **Wichtig:** Lege in MonKey Office einen eigenen Benutzer nur für die API an.  
> Admin-User können sich nicht über die API anmelden!

---

## 2. GitHub Repo einrichten

```bash
# Repo klonen (nachdem du es auf GitHub angelegt hast)
git clone https://github.com/kustus/MO-Connect-MCP.git
cd monkey-office-mcp

# Dateien hinzufügen und pushen
git add .
git commit -m "Initial commit: MonKey Office MCP Server"
git push origin main
```

---

## 3. QNAP Container Station Setup

### Option A: Direkt über docker-compose (empfohlen)

1. **SSH auf das QNAP** (in Container Station unter „Einstellungen" aktivieren):
   ```bash
   ssh admin@ac-nas1
   ```

2. **Verzeichnis anlegen und Dateien klonen:**
   ```bash
   mkdir -p /share/Container/monkey-office-mcp
   cd /share/Container/monkey-office-mcp
   git clone https://github.com/kustus/MO-Connect-MCP.git .
   ```

3. **docker-compose.yml anpassen** – trage deine Zugangsdaten ein:
   ```bash
   nano docker-compose.yml
   # MO_USER, MO_PASS und MO_FIRMA_KEY eintragen
   ```

4. **Container starten:**
   ```bash
   docker compose up -d
   ```

5. **Prüfen ob alles läuft:**
   ```bash
   curl http://ac-nas1:3000/health
   # Erwartet: {"status":"ok","service":"monkey-office-mcp",...}
   ```

### Option B: Container Station GUI

1. Container Station öffnen → **„Anwendung erstellen"**
2. **„Aus docker-compose erstellen"** wählen
3. Inhalt der `docker-compose.yml` einfügen und Zugangsdaten eintragen
4. Erstellen klicken

---

## 4. Claude Desktop App konfigurieren

Die Konfigurationsdatei liegt je nach Betriebssystem hier:

| OS      | Pfad                                                                 |
|---------|----------------------------------------------------------------------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json`   |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                        |

**Inhalt der Konfigurationsdatei:**

```json
{
  "mcpServers": {
    "monkey-office": {
      "url": "http://ac-nas1:3000/sse"
    }
  }
}
```

> Falls `ac-nas1` nicht per Hostname auflösbar ist, die IP-Adresse des QNAP verwenden:
> ```json
> "url": "http://192.168.178.XX:3000/sse"
> ```

**Claude Desktop neu starten** – fertig!

---

## 5. Testen

In Claude Desktop einfach fragen:

- *„Welche Firmen sind in MonKey Office verfügbar?"*
- *„Zeig mir alle Buchungen von Januar bis März 2024"*
- *„Wie war mein Umsatz dieses Jahr?"*
- *„Welche Rechnungen sind noch offen?"*
- *„Zeig mir alle Buchungen auf Konto 4000"*
- *„Wie hoch sind meine Verbindlichkeiten gegenüber Lieferanten?"*

---

## Verfügbare Tools

| Tool                 | Beschreibung                                                  |
|----------------------|---------------------------------------------------------------|
| `firma_list`         | Alle Firmen/Mandanten auflisten (liefert Firma_ID)           |
| `firma_get`          | Firmendetails (Kontenplan, Geschäftsjahr etc.)               |
| `buchung_list`       | Buchungen filtern (Zeitraum, Konto, Kostenstelle)            |
| `buchung_get`        | Einzelbuchung mit Journalzeilen                              |
| `buchung_konto_list` | Kontenplan auflisten                                         |
| `verkaufbeleg_list`  | Rechnungen, Angebote, Zahlungsstatus                         |
| `verkaufbeleg_get`   | Einzelbeleg mit allen Positionen                             |
| `einkaufbeleg_list`  | Eingangsrechnungen, Bestellungen                             |
| `offene_posten_list` | Offene Forderungen und Verbindlichkeiten                     |
| `debitor_list`       | Debitorenkonten mit Salden                                   |
| `kreditor_list`      | Kreditorenkonten mit Salden                                  |
| `adresse_list`       | Kunden und Lieferanten suchen                                |
| `adresse_get`        | Adressdetails                                                |
| `artikel_list`       | Artikel und Leistungen                                       |
| `projekt_list`       | Projekte                                                     |
| `steuersatz_list`    | Steuersätze                                                  |
| `kostenstellen_list` | Kostenstellen                                                |

---

## Updates einspielen

```bash
# Auf dem QNAP (SSH):
cd /share/Container/monkey-office-mcp
git pull
docker compose up -d --build
```

## Logs anzeigen

```bash
docker logs monkey-office-mcp -f
```
