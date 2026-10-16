# PianoSnabb

Webbapp (PWA) som lär dig piano snabbt: ackordigenkänning via mobilens mikrofon eller ett MIDI-keyboard (Bluetooth/USB), snabbspår i åtta steg, teori, progressioner, ackordlåtar, fingerspel not för not (Für Elise m.fl.) och nynn-till-melodi med redigerbar piano roll.

Struktur: `index.html` (markup + CSS), `js/app.js` (app), `js/audio.js` (samplad flygel + syntfallback), `js/pianoroll.js` (piano roll), `sw.js` (offline-cache).

## Köra lokalt

```bash
npx serve .
```

Mikrofon och MIDI kräver HTTPS eller localhost.

## Deploy (Vercel)

Statisk sajt, ingen build. `vercel.json` sätter rätt headers för service worker och manifest.

```bash
npx vercel --prod
```

Vid uppdatering: byt `CACHE`-namnet i `sw.js` så installerade appar hämtar nytt.
