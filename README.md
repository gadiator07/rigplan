# RigPlan

Rig- und Lichtplanung für die Eventtechnik: Truss aus echten Normteilen, 2D-Lampenplan und 3D-Ansicht, DMX-Patch, Strom und Lasten, LED-Wände, Podeste, Ton, PDF-Export und MVR-Export zum Vorprogrammieren auf der grandMA3.

## Installieren

Unter **Releases** die Datei `RigPlan-Setup-x.y.z.exe` laden und starten (Windows, 64 Bit).

Die App ist nicht signiert. Windows warnt deshalb beim Start: **„Weitere Informationen“ → „Trotzdem ausführen“**.

## Erste Schritte

- **Plan und 3D:** Reiter „Lampenplan“ und „3D“. Rechts unter „Show“ lädt „Beispiel-Rig laden“ ein fertiges Beispiel.
- **Geräte:** Links suchen oder nach Hersteller filtern, anklicken und auf einen blauen Punkt am Gurt setzen.
- **Herstellerprofile:** Knopf „GDTF Share“ (eigener kostenloser Account auf [gdtf-share.com](https://gdtf-share.com)).
- **Nach grandMA3:** „MVR für grandMA3“ erzeugt die Datei. Ab grandMA3 2.4 nach `C:\ProgramData\MALightingTechnology\gma3_library\mvr` legen, dann Menu → Show Creator → Partial Show Read → MVR.
- **3D-Maus bei Auswahl + Griff „Verschieben“:** Links ziehen dreht, Rechtsklick wählt, rechts am Pfeil ziehen verschiebt, Shift + Links zieht einen Rahmen.

## Grenzen

- Lasten sind vereinfacht auf die zwei nächsten Aufhängepunkte verteilt. Das ersetzt keine statische Berechnung.
- Die Bibliothek stammt aus der Open Fixture Library und wird von der Community gepflegt: Kanalbelegung vor der Show prüfen.
- Für Bibliotheksgeräte erzeugt RigPlan ein einfaches GDTF ohne Farbräder und echte 3D-Modelle. Pixel-Kanäle kommen als „Control“ an.
- Lautsprecher, LED-Panels und Truss-Gewichte sind teils Richtwerte. Datenblatt eintragen.

## Entwickeln

Voraussetzung: [Node.js](https://nodejs.org) 22 oder neuer.

```bash
cd app
npm ci
npm start
```

| Was | Wo |
|---|---|
| Die ganze Oberfläche und Logik (läuft auch direkt im Browser) | `rigplan.html` |
| Geräte-Bibliothek, erzeugt | `library/ofl-lib.js` |
| Desktop-App (Electron) | `app/main.js`, `app/preload.js` |
| Baut `app/renderer/` mit lokalen Bibliotheken aus `rigplan.html` | `app/tools/build-renderer.js` |
| Test der App mit echten Mausereignissen | `npm run test:app` in `app/` |

**Installer bauen:** `npm run dist` in `app/`, das Ergebnis landet in `app/dist/`. Der Ordner braucht einen kurzen Pfad, z. B. `C:\dev\rigplan`, sonst scheitert der Installer-Baustein an der Pfadlänge.

**Bibliothek aktualisieren:** Die [Open Fixture Library](https://github.com/OpenLightingProject/open-fixture-library) laden und in `app/` ausführen:

```bash
node tools/build-library.js <pfad>/fixtures ../library/ofl-lib.js <pfad>/LICENSE
```

## Lizenzen

Die Geräte-Bibliothek stammt aus der Open Fixture Library (MIT, siehe `library/OFL-LICENSE.txt`). Die App bringt außerdem three.js, JSZip, jsPDF, Electron und die Schriften Barlow und JetBrains Mono mit. Die Lizenztexte stehen nach dem Bauen in `app/renderer/THIRD-PARTY.txt`.

Für den eigenen Code von RigPlan ist noch keine Lizenz festgelegt.
