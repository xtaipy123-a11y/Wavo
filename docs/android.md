# Wavo auf Android testen

Das Android-Projekt verwendet Capacitor. Die lokale APK ist eine **Debug-Version** für Tests. Für eine reguläre Android-Veröffentlichung sind ein eigener Signierschlüssel und Tests auf einem Gerät nötig.

## Pfade auf diesem PC

- Android Studio: `D:\androidStudio`
- Android SDK: `D:\Android\Sdk`
- Emulator-Geräte: `D:\Android\Avd`
- Gradle-Cache: `D:\Android\.gradle`
- Java 21: `D:\Android\Java\jdk-21.0.12.1+1`

In Android Studio unter **Settings → Appearance & Behavior → System Settings → Android SDK** bei **Android SDK Location** `D:\Android\Sdk` eintragen und Android Studio anschließend neu starten. Die Umgebungsvariablen `ANDROID_HOME`, `ANDROID_AVD_HOME`, `ANDROID_USER_HOME`, `GRADLE_USER_HOME` und `STUDIO_GRADLE_JDK` sind für künftige Starts auf D gesetzt. Das Projekt verwendet zusätzlich eine lokale, nicht versionierte `android/local.properties`.

## Debug-APK bauen

```powershell
cd D:\Wavo
pnpm install
pnpm build:android
cd android
$env:JAVA_HOME = 'D:\Android\Java\jdk-21.0.12.1+1'
.\gradlew.bat assembleDebug
```

Die APK liegt danach unter `D:\Wavo\android\app\build\outputs\apk\debug\app-debug.apk`.

## Auf dem PC starten

1. Android Studio öffnen und `D:\Wavo\android` als Projekt auswählen.
2. Im **Device Manager** ein virtuelles Android-Gerät erstellen. Das bereits angelegte `Wavo_Test_API36` verwendet ein Systemabbild auf D.
3. Das Gerät starten und die App über **Run** ausführen oder die Debug-APK mit `adb install` installieren.

Ein Emulator benötigt freie Systemressourcen und unter Windows einen funktionierenden Hypervisor. Auf diesem PC meldete `emulator -accel-check` noch keinen verfügbaren Beschleuniger. Der APK-Build war erfolgreich, aber ein Laufzeittest im Emulator steht deshalb noch aus.

Die Android-Version ist ein erster Teststand. Insbesondere Anmeldung nach einem kompletten Neustart, Audio im Hintergrund, Downloads und gerätespezifische Mediensteuerung müssen vor einer Veröffentlichung auf einem Android-Gerät geprüft werden.
