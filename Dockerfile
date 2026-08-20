FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      xfce4 \
      dbus-x11 \
      xvfb \
      libxtst-dev \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*