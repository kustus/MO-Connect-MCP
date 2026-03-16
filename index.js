#!/usr/bin/env node
/**
 * MCP Server für MonKey Office Connect JSON-API
 * Transport: HTTP/SSE – für Claude Desktop App im lokalen LAN
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

// ── Konfiguration aus Umgebungsvariablen ──────────────────────────────────────
const MO_URL       = process.env.MO_URL       || "http://192.168.178.53:8084/monkeyOfficeConnectJSON";
const MO_USER      = process.env.MO_USER      || "";
const MO_PASS      = process.env.MO_PASS      || "";
const MO_FIRMA_KEY = process.env.MO_FIRMA_KEY || "";
const PORT         = parseInt(process.env.PORT || "3000");

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function moAuthHeader() {
  return "Basic " + Buffer.from(`${MO_USER}:${MO_PASS}`).toString("base64");
}

async function callAPI(payload, firmaKey) {
  const key = firmaKey || MO_FIRMA_KEY;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Authorization": moAuthHeader(),
  };
  if (key) headers["mbl-ident"] = key;

  const response = await fetch(MO_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`MonKey Office API: HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

// ── MCP Server Factory (pro SSE-Verbindung eine Instanz) ─────────────────────
function createMCPServer() {
  const server = new Server(
    { name: "monkey-office-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Firmen
      {
        name: "firma_list",
        description: "Listet alle Firmen/Mandanten. Liefert die Firma_ID, die für alle anderen Tools benötigt wird.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "firma_get",
        description: "Detailinfos zur Firma: Name, Adresse, Steuernummer, Kontenplan, Geschäftsjahr.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key: { type: "string", description: "Firma_ID aus firma_list (optional wenn Standard gesetzt)" },
          },
        },
      },
      // Buchungen
      {
        name: "buchung_list",
        description: "Buchungen/Journal aus der Buchhaltung. Filtern nach Zeitraum, Konto, Kostenstelle. Für Jahresergebnis, GuV, Kontenanalyse.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:          { type: "string",  description: "Firma_ID (optional)" },
            datum_von:          { type: "string",  description: "Startdatum YYYY-MM-DD" },
            datum_bis:          { type: "string",  description: "Enddatum YYYY-MM-DD" },
            konto:              { type: "integer", description: "Kontonummer (optional)" },
            kostenstelle:       { type: "string",  description: "Kostenstelle (optional)" },
            festschreib_status: { type: "integer", description: "1=Erfasst 2=Festgeschrieben 4=Alle (Standard: 4)" },
            suchtext:           { type: "string",  description: "Freitextsuche im Buchungstext" },
          },
        },
      },
      {
        name: "buchung_get",
        description: "Details einer einzelnen Buchung inkl. Journalzeilen.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string", description: "Firma_ID (optional)" },
            buchung_id: { type: "string", description: "Buchungs-ID" },
          },
          required: ["buchung_id"],
        },
      },
      {
        name: "buchung_konto_list",
        description: "Kontenplan der Firma (SKR03, SKR04, EÜ). Kontonummern für Auswertungen ermitteln.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string",  description: "Firma_ID (optional)" },
            suchtext:   { type: "string",  description: "Suche nach Kontoname oder -nummer" },
            konto_von:  { type: "integer", description: "Kontobereich von" },
            konto_bis:  { type: "integer", description: "Kontobereich bis" },
          },
        },
      },
      // Verkaufsbelege
      {
        name: "verkaufbeleg_list",
        description: "Verkaufsbelege: Rechnungen, Angebote, Lieferscheine, Gutschriften. Für Umsatzauswertungen und offene Rechnungen.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:      { type: "string",  description: "Firma_ID (optional)" },
            datum_von:      { type: "string",  description: "Startdatum YYYY-MM-DD" },
            datum_bis:      { type: "string",  description: "Enddatum YYYY-MM-DD" },
            adresse_id:     { type: "string",  description: "Kunden-ID filtern (optional)" },
            nur_rechnungen: { type: "boolean", description: "Nur Rechnungen anzeigen" },
            nur_angebote:   { type: "boolean", description: "Nur Angebote anzeigen" },
            zahlungstatus:  { type: "integer", description: "0=Ohne 1=Offen 2=Teilweise 3=Bezahlt" },
            suchtext:       { type: "string",  description: "Freitextsuche" },
          },
        },
      },
      {
        name: "verkaufbeleg_get",
        description: "Vollständige Details eines Verkaufsbelegs inkl. aller Positionen, Preise und Steuern.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:       { type: "string", description: "Firma_ID (optional)" },
            verkaufbeleg_id: { type: "string", description: "Beleg-ID" },
          },
          required: ["verkaufbeleg_id"],
        },
      },
      // Einkaufsbelege
      {
        name: "einkaufbeleg_list",
        description: "Einkaufsbelege: Eingangsrechnungen, Bestellungen, Wareneingänge. Filter nach Zeitraum und Lieferant.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:     { type: "string",  description: "Firma_ID (optional)" },
            datum_von:     { type: "string",  description: "Startdatum YYYY-MM-DD" },
            datum_bis:     { type: "string",  description: "Enddatum YYYY-MM-DD" },
            adresse_id:    { type: "string",  description: "Lieferanten-ID (optional)" },
            zahlungstatus: { type: "integer", description: "0=Ohne 1=Offen 2=Teilweise 3=Bezahlt" },
            suchtext:      { type: "string",  description: "Freitextsuche" },
          },
        },
      },
      // Offene Posten
      {
        name: "offene_posten_list",
        description: "Offene Forderungen (Kunden) und Verbindlichkeiten (Lieferanten). Für Liquiditätsplanung und Mahnwesen.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string",  description: "Firma_ID (optional)" },
            datum_von:  { type: "string",  description: "Startdatum YYYY-MM-DD" },
            datum_bis:  { type: "string",  description: "Enddatum YYYY-MM-DD" },
            adresse_id: { type: "string",  description: "Kunden- oder Lieferanten-ID (optional)" },
            nur_offene: { type: "boolean", description: "Nur wirklich offene Posten (Standard: true)" },
          },
        },
      },
      // Debitoren / Kreditoren
      {
        name: "debitor_list",
        description: "Debitorenkonten mit Salden (Kundenforderungen).",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string", description: "Firma_ID (optional)" },
            datum_von:  { type: "string", description: "Startdatum YYYY-MM-DD" },
            datum_bis:  { type: "string", description: "Enddatum YYYY-MM-DD" },
            adresse_id: { type: "string", description: "Kunden-ID (optional)" },
          },
        },
      },
      {
        name: "kreditor_list",
        description: "Kreditorenkonten mit Salden (Lieferantenverbindlichkeiten).",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string", description: "Firma_ID (optional)" },
            datum_von:  { type: "string", description: "Startdatum YYYY-MM-DD" },
            datum_bis:  { type: "string", description: "Enddatum YYYY-MM-DD" },
            adresse_id: { type: "string", description: "Lieferanten-ID (optional)" },
          },
        },
      },
      // Adressen
      {
        name: "adresse_list",
        description: "Kunden und Lieferanten suchen und auflisten.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:          { type: "string",  description: "Firma_ID (optional)" },
            suchtext:           { type: "string",  description: "Freitextsuche" },
            matchcode:          { type: "string",  description: "Matchcode-Suche" },
            nur_kunden:         { type: "boolean", description: "Nur Kunden" },
            nur_lieferanten:    { type: "boolean", description: "Nur Lieferanten" },
            kunden_status:      { type: "integer", description: "-2=alle 1=aktiv 2=inaktiv 3=gesperrt" },
            lieferanten_status: { type: "integer", description: "-2=alle 1=aktiv 2=inaktiv 3=gesperrt" },
          },
        },
      },
      {
        name: "adresse_get",
        description: "Vollständige Details einer Adresse (Kontaktdaten, Konten, Zahlungsbedingungen).",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:  { type: "string", description: "Firma_ID (optional)" },
            adresse_id: { type: "string", description: "Adress-ID" },
          },
          required: ["adresse_id"],
        },
      },
      // Artikel
      {
        name: "artikel_list",
        description: "Artikel und Leistungen auflisten. Filter nach Bezeichnung, Warengruppe, Artikelart.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key:   { type: "string",  description: "Firma_ID (optional)" },
            suchtext:    { type: "string",  description: "Freitextsuche" },
            artikelart:  { type: "integer", description: "1=Artikel 2=Leistung" },
            nur_lager:   { type: "boolean", description: "Nur Lagerartikel" },
            warengruppe: { type: "string",  description: "Warengruppe filtern" },
          },
        },
      },
      // Projekte & Vorgaben
      {
        name: "projekt_list",
        description: "Projekte auflisten für projektbezogene Auswertungen.",
        inputSchema: {
          type: "object",
          properties: {
            firma_key: { type: "string", description: "Firma_ID (optional)" },
            suchtext:  { type: "string", description: "Freitextsuche" },
          },
        },
      },
      {
        name: "steuersatz_list",
        description: "Alle definierten Steuersätze der Firma.",
        inputSchema: {
          type: "object",
          properties: { firma_key: { type: "string", description: "Firma_ID (optional)" } },
        },
      },
      {
        name: "kostenstellen_list",
        description: "Alle definierten Kostenstellen der Firma.",
        inputSchema: {
          type: "object",
          properties: { firma_key: { type: "string", description: "Firma_ID (optional)" } },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const fk = args.firma_key || MO_FIRMA_KEY;

    try {
      let result;
      switch (name) {
        case "firma_list":
          result = await callAPI({ firmaList: "" });
          break;
        case "firma_get":
          result = await callAPI({ firmaGet: "" }, fk);
          break;
        case "buchung_list": {
          const f = {};
          if (args.datum_von)          f.DatumVon          = args.datum_von;
          if (args.datum_bis)          f.DatumBis          = args.datum_bis;
          if (args.konto)              f.Konto             = args.konto;
          if (args.kostenstelle)       f.Kostenstelle      = args.kostenstelle;
          if (args.festschreib_status) f.FestschreibStatus = args.festschreib_status;
          if (args.suchtext)           f.Suchtext          = args.suchtext;
          result = await callAPI({ buchungList: { BuchungFilter: f } }, fk);
          break;
        }
        case "buchung_get":
          result = await callAPI({ buchungGet: { Buchung_ID: args.buchung_id } }, fk);
          break;
        case "buchung_konto_list": {
          const f = {};
          if (args.suchtext)  f.Suchtext = args.suchtext;
          if (args.konto_von) f.KontoVon = args.konto_von;
          if (args.konto_bis) f.KontoBis = args.konto_bis;
          result = await callAPI({ buchungKontoList: { BuchungKontoFilter: f } }, fk);
          break;
        }
        case "verkaufbeleg_list": {
          const f = {};
          if (args.datum_von)           f.DatumVon      = args.datum_von;
          if (args.datum_bis)           f.DatumBis      = args.datum_bis;
          if (args.adresse_id)          f.Adresse_ID    = args.adresse_id;
          if (args.suchtext)            f.Suchtext      = args.suchtext;
          if (args.zahlungstatus != null) f.Zahlungstatus = args.zahlungstatus;
          if (args.nur_rechnungen)      f.Rechnung      = true;
          if (args.nur_angebote)        f.Angebot       = true;
          result = await callAPI({ verkaufbelegList: { VerkaufbelegFilter: f } }, fk);
          break;
        }
        case "verkaufbeleg_get":
          result = await callAPI({ verkaufbelegGet: { Verkaufbeleg_ID: args.verkaufbeleg_id } }, fk);
          break;
        case "einkaufbeleg_list": {
          const f = {};
          if (args.datum_von)           f.DatumVon      = args.datum_von;
          if (args.datum_bis)           f.DatumBis      = args.datum_bis;
          if (args.adresse_id)          f.Adresse_ID    = args.adresse_id;
          if (args.suchtext)            f.Suchtext      = args.suchtext;
          if (args.zahlungstatus != null) f.Zahlungstatus = args.zahlungstatus;
          result = await callAPI({ einkaufbelegList: { EinkaufbelegFilter: f } }, fk);
          break;
        }
        case "offene_posten_list": {
          const f = {};
          if (args.datum_von)  f.DatumVon   = args.datum_von;
          if (args.datum_bis)  f.DatumBis   = args.datum_bis;
          if (args.adresse_id) f.Adresse_ID = args.adresse_id;
          if (args.nur_offene !== false) f.NurOffene = true;
          result = await callAPI({ offenePostenList: { OffenePostenFilter: f } }, fk);
          break;
        }
        case "debitor_list": {
          const f = {};
          if (args.datum_von)  f.DatumVon   = args.datum_von;
          if (args.datum_bis)  f.DatumBis   = args.datum_bis;
          if (args.adresse_id) f.Adresse_ID = args.adresse_id;
          result = await callAPI({ debitorList: { DebitorFilter: f } }, fk);
          break;
        }
        case "kreditor_list": {
          const f = {};
          if (args.datum_von)  f.DatumVon   = args.datum_von;
          if (args.datum_bis)  f.DatumBis   = args.datum_bis;
          if (args.adresse_id) f.Adresse_ID = args.adresse_id;
          result = await callAPI({ kreditorList: { KreditorFilter: f } }, fk);
          break;
        }
        case "adresse_list": {
          const f = {};
          if (args.suchtext)                  f.Suchtext           = args.suchtext;
          if (args.matchcode)                 f.Matchcode          = args.matchcode;
          if (args.nur_kunden)                f.KundenStatus       = 1;
          if (args.nur_lieferanten)           f.LieferantenStatus  = 1;
          if (args.kunden_status != null)     f.KundenStatus       = args.kunden_status;
          if (args.lieferanten_status != null)f.LieferantenStatus  = args.lieferanten_status;
          result = await callAPI({ adresseList: { AdresseFilter: f } }, fk);
          break;
        }
        case "adresse_get":
          result = await callAPI({ adresseGet: { Adresse_ID: args.adresse_id } }, fk);
          break;
        case "artikel_list": {
          const f = {};
          if (args.suchtext)    f.Suchtext        = args.suchtext;
          if (args.artikelart)  f.Artikelart      = args.artikelart;
          if (args.nur_lager)   f.nurLagerArtikel = true;
          if (args.warengruppe) f.Warengruppe     = args.warengruppe;
          result = await callAPI({ artikelList: { ArtikelFilter: f } }, fk);
          break;
        }
        case "projekt_list": {
          const f = {};
          if (args.suchtext) f.Suchtext = args.suchtext;
          result = await callAPI({ projektList: { ProjektFilter: f } }, fk);
          break;
        }
        case "steuersatz_list":
          result = await callAPI({ steuersatzList: "" }, fk);
          break;
        case "kostenstellen_list":
          result = await callAPI({ kostenstellenList: "" }, fk);
          break;
        default:
          throw new Error(`Unbekanntes Tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Fehler: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health-Check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "monkey-office-mcp",
    version: "1.0.0",
    mo_url: MO_URL,
    firma_key_set: !!MO_FIRMA_KEY,
  });
});

// SSE Verbindungsendpunkt – Claude Desktop verbindet sich hier
const transports = {};

app.get("/sse", async (req, res) => {
  console.log(`[${new Date().toISOString()}] Neue SSE-Verbindung von ${req.ip}`);
  const transport = new SSEServerTransport("/message", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    console.log(`[${new Date().toISOString()}] SSE-Verbindung getrennt (${transport.sessionId})`);
    delete transports[transport.sessionId];
  });

  const server = createMCPServer();
  await server.connect(transport);
});

// POST Nachrichten-Endpoint
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).json({ error: "Session nicht gefunden" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║   MonKey Office MCP Server gestartet             ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Port:        ${PORT}                                ║`);
  console.log(`║  SSE:         http://<nas-ip>:${PORT}/sse            ║`);
  console.log(`║  Health:      http://<nas-ip>:${PORT}/health         ║`);
  console.log(`║  MonKey URL:  ${MO_URL.substring(0, 35)}...  ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  if (!MO_USER)      console.warn("⚠️  MO_USER nicht gesetzt!");
  if (!MO_PASS)      console.warn("⚠️  MO_PASS nicht gesetzt!");
  if (!MO_FIRMA_KEY) console.warn("⚠️  MO_FIRMA_KEY nicht gesetzt – bitte zuerst firma_list aufrufen");
});
