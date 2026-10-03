#pragma once

#include "Arduino.h"

class Preferences {
 public:
  bool begin(const char *, bool);
  void end();
  String getString(const char *, const char *);
  size_t putString(const char *, const String &);
  uint32_t getUInt(const char *, uint32_t);
  size_t putUInt(const char *, uint32_t);
};
