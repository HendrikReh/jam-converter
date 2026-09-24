# JAM-Konverter

Lokale FigJam-Dateien in bearbeitbare Architekturdokumentation umwandeln:

- Mermaid-Flowcharts nach Boardbereich, mit nativen Verbindungen und Pfeilrichtungen.
- Mermaid-Sequenzen bei ausdrücklich nummerierten Nachrichten in einer Sequenz-/Ablaufsektion.
- Markdown für Anforderungen, Workshop-Notizen und Tabellen.
- ADR-Entwürfe bei ausdrücklich dokumentierten Entscheidungen und Begründungen.
- Optionale KI-Auswertung ausgewählter Texte und Diagrammbilder über OpenAI.

Jede Ableitung enthält Quellenreferenzen. Unklare Inhalte bleiben im Prüfbericht sichtbar. Ein Quelltext wie „ignoriere alle Anweisungen“ wird als Dokumentinhalt behandelt.

## Start

Benötigt Node.js **24 oder neuer** und pnpm. Es wird kein Figma-Zugang benötigt.

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
node dist/cli.js convert "/pfad/board.jam" --out output/board
```

Für die Entwicklung ohne Build: `pnpm start convert "/pfad/board.jam" --out output/board`.
Die Paket-Bin heißt `jam-convert`; nach einer lokalen Installation des Pakets kann sie direkt aufgerufen werden. Das Projekt ist als `private` markiert und wird nicht versehentlich veröffentlicht.

Ein synthetisches Beispiel demonstriert alle vier Ausgabearten ohne Kundendaten:

```sh
node dist/cli.js render examples/demo.model.json --out output/demo
```

## Befehle

| Befehl                                                           | Zweck                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `inspect board.jam`                                              | JSON-Inventar mit Elementtypen, Sections und Bild-IDs |
| `inspect board.jam --sources`                                    | Zusätzlich originale Texte und native Node-IDs        |
| `convert board.jam --out output/board`                           | Vollständig lokale Konvertierung                      |
| `convert board.jam --mapping mapping.json --out output/board`    | Lokale Zuordnungen und Ergänzungen anwenden           |
| `render output/board/model.json --out output/reviewed`           | Gespeichertes Modell ohne KI erneut exportieren       |
| `render model.json --mapping mapping.json --out output/reviewed` | Modell lokal korrigieren und exportieren              |
| `enrich model.json --model MODELL --dry-run`                     | Geplante Datenübertragung prüfen, ohne Netzwerkaufruf |

`--out` bezeichnet immer einen **Ordner**. Das ist auch bei `enrich` der Fall: Modell und Bilddateien bleiben zusammen und lassen sich später offline rendern. Alle Befehle geben JSON-Zusammenfassungen auf stdout aus; Fehler stehen auf stderr, Exitcode 1. Erfolg verwendet Exitcode 0.

Bestehende Ausgabeordner werden standardmäßig abgelehnt. `--overwrite` aktualisiert nur anhand eines Manifests bekannte, unveränderte Konverterdateien. Eigene Dateien bleiben erhalten; bei manuell geänderten Konverterdateien oder Namenskollisionen bricht der Export ab. Für Änderungen das Modell bzw. eine Mapping-Datei bearbeiten und in einen neuen Ordner rendern.

## Ausgabe

```text
README.md               Überblick mit Mermaid-Diagrammen
model.json              Bearbeitbares fachliches Modell einschließlich Quellen
sources.json            Normalisierte native Boardelemente
sources.md              Quellenkatalog mit Originaltexten und Bildern
requirements.md         Klassifizierte Anforderungen
workshop-results.md     Notizen und native Tabellen nach Boardbereich
review.md               Offene Beziehungen, Bildauswertung und weitere Prüfpunkte
diagrams/*.mmd          Flowcharts nach Bereich/Sicht
sequences/*.mmd         Belegte nummerierte Interaktionen
adrs/*.md               ADR-Entwürfe
assets/*                Eingebettete Bilder
.jam-converter.json     Manifest für kontrolliertes Überschreiben
```

Die Markdown-Dateien sind mit jedem Texteditor lesbar. Ein Reader mit Mermaid-Unterstützung stellt die Diagramme direkt dar. `model.json`, `sources.json` und `assets/` gehören zusammen; ein verschobenes Modell braucht die zugehörigen Bilddateien im selben relativen Pfad.

## Was der lokale Modus erkennt

FigJam speichert Stickies, Formen und Connector-Beschriftungen teilweise in verschachtelten Text-Overrides. Der Import liest diese Texte und die Zeilen-/Spaltenreihenfolge nativer Tabellen aus. Verdeckte und gelöschte Elemente bleiben im Quellenkatalog dokumentiert, erscheinen aber nicht als aktive fachliche Inhalte.

Sections bilden die anfänglichen Fachbereiche. Überschriften mit IST, SOLL/Ziel/Target oder Transition bilden die Sicht. Ein Name allein reicht nicht, um zwei Kästen zusammenzuführen. Bereichsübergreifende Verbindungen zeigen ihre externen Endpunkte ebenfalls.

Verbundene, kurze Kästen werden zunächst als **Diagrammelemente** übernommen. Der Konverter behauptet damit nicht, dass jeder Kasten ein Softwaresystem ist. Lange Texte, Fragen und unklassifizierte Notizen bleiben Workshop-Inhalte.

Anforderungen werden über explizite Anforderungssektionen oder Präfixe wie `Anforderung:` erkannt. ADRs benötigen einen klaren Marker, etwa:

```text
Kontext: Ein Identity Provider ist vorhanden.
Entscheidung: OpenID Connect verwenden.
Begründung: Der vorhandene Provider unterstützt OIDC.
Folgen: Der Webshop benötigt einen OIDC-Client.
Status: Im Workshop beschlossen.
```

Fehlende Angaben heißen „nicht dokumentiert“. Jeder erzeugte ADR bleibt ein **Entwurf zur Prüfung**, auch wenn ein Beschlussstatus in der Quelle steht.

Sequenzen erfordern eine Sektion wie `Sequenz Login` oder `Ablauf Bestellung` und eindeutig nummerierte, gerichtete Connectoren (`1. Login`, `2. Token`). Die räumliche Anordnung allein begründet keine zeitliche Reihenfolge. Bei Lücken, doppelten Nummern oder unklarer Richtung wird keine Sequenz erfunden.

## Lokale Zuordnungen

[`examples/mapping.json`](examples/mapping.json) zeigt eine belegte Umformulierung einer Anforderung. Die vorhandene ID ersetzt denselben Datensatz; eine neue ID ergänzt einen Eintrag. Nicht angegebene Kategorien bleiben erhalten.

Ein Mapping kann diese Arrays enthalten:

- `areas`: neue oder umbenannte Bereiche mit `id`, `title` und `view`.
- `assignments`: `{ "sourceId": "1:2", "areaId": "area-1:1" }` ordnet aus dieser Quelle abgeleitete Inhalte einem Bereich zu.
- `excludeIds`: fachliche Inhalts-IDs, die aus der Ausgabe entfernt werden. Verweisende Beziehungen müssen ebenfalls angepasst werden.
- `systems`, `relations`, `sequences`, `requirements`, `workshop`, `decisions`: belegte Ergänzungen oder Ersetzungen.

Ein Textbeleg besteht aus `sourceId`, einem wörtlichen `quote` und `region: null`. Für Bildbelege ist `sourceId` die Bild-ID (`image:…`) und `region` beschreibt den sichtbaren Bereich. Texte müssen im zitierten Original vorkommen. Referenzen und Sequenznummern werden validiert. Bei nativen Texten muss die Nummerierung am Anfang einer Originalzeile stehen; ein verkürztes Zitat darf keine Reihenfolge erzeugen. Nummern in Bildbelegen bleiben visuell zu prüfende Interpretationen. Die Typen und Felddefinitionen stehen in [`src/model.ts`](src/model.ts); [`examples/demo.model.json`](examples/demo.model.json) enthält vollständige Datensätze.

## Optionale KI-Auswertung

Der erste unterstützte Provider ist **OpenAI Responses**. Du wählst ein in deinem API-Projekt verfügbares Modell mit Structured Outputs und, für Bildauswertung, Bildverständnis. Kein Modell wird stillschweigend voreingestellt.

```sh
export OPENAI_API_KEY="dein-api-schluessel"
export JAM_CONVERTER_MODEL="dein-modell"

# Auswahl prüfen: sichtbare Texte, keine Bilder, keine Übertragung
node dist/cli.js enrich output/board/model.json --dry-run

# Nur die angegebene Textquelle übertragen
node dist/cli.js enrich output/board/model.json \
  --source "1:2" --out output/enriched

# Nur ein ausgewähltes Bild übertragen
node dist/cli.js enrich output/board/model.json \
  --no-text --image "image:BILDHASH_AUS_INSPECT" --out output/vision
```

`--source` und `--image` sind wiederholbar. Ohne `--source` werden alle sichtbaren nativen Texte gewählt; Bilder werden ausschließlich über `--image` hinzugefügt. `--no-text` schaltet die Textauswahl aus. Ein vorhandener Schlüssel aktiviert keine KI: `convert` und `render` bleiben offline.

Bereits vorhandene Ausgabeordner ohne `--overwrite`, ungültige Manifeste und manuell geänderte Ausgaben werden vor dem API-Aufruf abgelehnt; der Export prüft sie anschließend erneut.

Ein Aufruf von `enrich` ohne `--dry-run` sendet die gewählten Daten an die OpenAI-API und kann API-Kosten verursachen. Der Request verwendet `store: false`. Das ist keine Zusage über sämtliche Aufbewahrungsbedingungen des API-Kontos.

KI-Ausgaben sind Ergänzungsvorschläge mit Quellenbelegen. Der Konverter prüft Schema, Referenzen und Textzitate; das ersetzt keine fachliche Prüfung der Aussagen oder visuelle Kontrolle von Pfeilrichtungen. KI-Vorschläge dürfen native Inhalte weder löschen noch überschreiben. Sie werden auch in einzelnen Mermaid-Dateien als KI-Vorschläge gekennzeichnet und lassen sich anschließend lokal überarbeiten. Beziehungen dürfen nur übermittelte bestehende oder neu vorgeschlagene Systeme referenzieren.

Pro Aufruf gelten Grenzen von 12 Bildern, 160.000 Zeichen Quelltext und 24 MiB Requestgröße. Bei Überschreitung muss die Auswahl verkleinert werden; es wird nicht stillschweigend gekürzt. Fehlende Konfiguration, HTTP-Fehler, verweigerte oder unvollständige Antworten führen zu einem Fehler statt zu scheinbar erfolgreicher Konvertierung.

## Grenzen

- JAM ist ein proprietäres Format. Version 106 wurde mit den beiden bereitgestellten Dateien geprüft; zukünftige Exporte können Anpassungen benötigen.
- Die lokale Konvertierung rekonstruiert Bilddiagramme nicht. Sie erhält die Bilder und markiert sie für visuelle Auswertung bzw. KI-Auswertung.
- Farben allein werden nicht als fachlicher Status interpretiert. Bestätigte Bedeutungen können im Modell explizit als Status ergänzt werden.
- Native Figma-Komponenten, Widgets und komplexe Vektorgrafiken werden nicht vollständig gerendert. Verfügbare Texte bleiben erhalten; nicht unterstützte Typen stehen im Prüfbericht.
- Kommentare und Versionshistorie sind nicht Bestandteil lokaler JAM-Kopien.
- Begrenzung: 64 MiB Eingabedatei, 256 MiB entpackte Daten, 100.000 native Nodes. Die Standards sind für lokale Projektboards ausgelegt.

## Entwicklung und Prüfung

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
node scripts/validate-mermaid.ts output
```

Tests decken native Tabellen/Connectoren, verdeckte Inhalte, Quellbelege, Zuordnungen, Chronologie, ADRs, Mermaid-Syntax, Dateischutz und CLI-Verhalten ab. KI-Tests ersetzen ausschließlich den HTTP-Transport; Kundendaten werden dafür nicht übertragen.

Die lokalen Kundenbeispiele und erzeugten Dokumente liegen unter dem ignorierten Verzeichnis `output/`; sie werden nicht ins Repository aufgenommen. Der lokale Prüfbericht ist `output/verification.md`.

Technische Referenzen: [Figma-Dateiformat](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files), [openfig-core](https://github.com/OpenFig-org/openfig-core), [Mermaid](https://mermaid.js.org/intro/syntax-reference.html), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI-Bildeingaben](https://developers.openai.com/api/docs/guides/images-vision).
