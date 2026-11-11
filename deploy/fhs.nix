let
  pkgs = import (builtins.getFlake "nixpkgs") { config = { allowUnfree = true; }; };
in
pkgs.buildFHSEnv {
  name = "cloak-fhs";
  targetPkgs = p: with p; [
    nodejs_22
    bashInteractive
    glibc
    nss
    nspr
    atk
    at-spi2-atk
    at-spi2-core
    cups
    libdrm
    libxkbcommon
    libgbm
    libGL
    mesa
    libX11
    libXcomposite
    libXdamage
    libXext
    libXfixes
    libXrandr
    libxcb
    libXrender
    libXi
    libXtst
    libXScrnSaver
    libXcursor
    libXinerama
    libxshmfence
    pango
    cairo
    gdk-pixbuf
    harfbuzz
    glib
    alsa-lib
    dbus
    expat
    fontconfig
    freetype
    libsecret
    krb5
    systemd
    libva
    libpulseaudio
    zlib
    libpng
    libjpeg
    xorg.xauth
    coreutils
    findutils
    gnused
    gnugrep
    ripgrep
    curl
    jq
  ];
  multiPkgs = _: [ ];
  runScript = "bash";
}
