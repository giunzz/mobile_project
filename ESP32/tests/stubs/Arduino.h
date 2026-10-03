#pragma once

#include <algorithm>
#include <stddef.h>
#include <stdint.h>

using std::max;
using std::min;

class String {
 public:
  String();
  String(const char *);
  String(uint32_t);
  size_t length() const;
  const char *c_str() const;
  char operator[](size_t) const;
  bool startsWith(const char *) const;
  String substring(unsigned int) const;
  float toFloat() const;
  bool operator==(const String &) const;
  bool operator!=(const String &) const;
  String operator+(const String &) const;
};

String operator+(const char *, const String &);

struct SerialStub {
  void println(const char *);
  void println();
  void printf(const char *, ...);
};
extern SerialStub Serial;

uint32_t millis();
void delay(uint32_t);
