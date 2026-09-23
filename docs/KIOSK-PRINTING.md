# Printing at the kiosk

The kiosk prints the receipt by itself the moment a card is scanned and the
check-in succeeds. Nobody should have to tap anything. What differs between
terminals is only *how* the job reaches the printer, and that is chosen once
per device with a query string, which the kiosk then remembers:

| Terminal | Open once | Route |
| --- | --- | --- |
| Windows / desktop Chrome with a USB or network printer | `/kiosk?print=browser` (the default) | the browser's own print |
| Android tablet with a Bluetooth thermal printer, running Fully Kiosk | `/kiosk?print=bt&bt=<printer name>` | straight over Bluetooth |
| Android with the RawBT print service | `/kiosk?print=rawbt` (or `?print=intent`) | RawBT, no dialog |

Paper width: 58mm is the default. Append `?paper=80` for a wider roll;
like the route, the terminal remembers it.

## Chrome: making it print without a dialog

This is the one that surprises people. `window.print()` in an ordinary Chrome
window opens the print preview and waits for a click — the receipt does not
come out until somebody presses Print.

Chrome will print silently, to the default printer, **only when it was started
with `--kiosk-printing`**. There is no way for the page to switch that on; it
is a property of how the browser was launched.

On Windows, make a shortcut to:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --app=https://YOUR-SMARTLAB-HOST/kiosk
```

Then, before the first run:

1. Set the thermal printer as the **default printer** in Windows — Chrome's
   silent print sends every job there without asking.
2. In its printing preferences set the paper to the roll (58mm, or 80mm
   where the terminal was set that way), so Chrome does not feed a whole
   A4 sheet per receipt.
3. Turn off *Let Windows manage my default printer* (Settings → Bluetooth &
   devices → Printers & scanners), or Windows will move the default away.

`--kiosk` also removes the address bar and toolbar, which is what you want on
a machine standing in a public room. Close it with Alt+F4.

## Checking a terminal

Open `/kiosk?debug=1`. The panel names the route the last job actually took,
which is the fact worth knowing when a kiosk prints in one browser and does
nothing in the one beside it.

The kiosk also holds the receipt on screen until the printer reports the job
finished, so a check-in never resets out from under a print that is still
being spooled.
