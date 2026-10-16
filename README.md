# PianoSnabb

Webbapp (PWA) som lär dig piano snabbt: ackordigenkänning via mobilens mikrofon eller ett MIDI-keyboard (Bluetooth/USB), snabbspår i åtta steg, teori, progressioner, låtar och nynn-till-melodi.

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
