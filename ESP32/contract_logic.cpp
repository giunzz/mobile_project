#include "contract_logic.h"

#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

namespace {
struct Span {
  const char *begin;
  const char *end;
};

enum class MemberResult { found, done, invalid };

void whitespace(const char *&p, const char *end) {
  while (p < end && isspace(static_cast<unsigned char>(*p))) ++p;
}

bool stringToken(const char *&p, const char *end,
                 char *output = nullptr, size_t capacity = 0) {
  if (p >= end || *p++ != '"') return false;
  size_t length = 0;
  while (p < end) {
    char c = *p++;
    if (c == '"') {
      if (output) output[length] = '\0';
      return true;
    }
    if (c == '\\') {
      if (p >= end) return false;
      c = *p++;
      switch (c) {
        case '"': case '\\': case '/': break;
        case 'b': c = '\b'; break;
        case 'f': c = '\f'; break;
        case 'n': c = '\n'; break;
        case 'r': c = '\r'; break;
        case 't': c = '\t'; break;
        default: return false; // Contract keys and times are ASCII.
      }
    }
    if (static_cast<unsigned char>(c) < 32) return false;
    if (output) {
      if (length + 1 >= capacity) return false;
      output[length++] = c;
    }
  }
  return false;
}

bool valueToken(const char *&p, const char *end, unsigned depth) {
  whitespace(p, end);
  if (p >= end || depth > 16) return false;
  if (*p == '"') return stringToken(p, end);
  if (*p == '{' || *p == '[') {
    const char close = *p++ == '{' ? '}' : ']';
    whitespace(p, end);
    if (p < end && *p == close) { ++p; return true; }
    while (p < end) {
      if (close == '}') {
        if (!stringToken(p, end)) return false;
        whitespace(p, end);
        if (p >= end || *p++ != ':') return false;
      }
      if (!valueToken(p, end, depth + 1)) return false;
      whitespace(p, end);
      if (p < end && *p == close) { ++p; return true; }
      if (p >= end || *p++ != ',') return false;
      whitespace(p, end);
    }
    return false;
  }
  const char *start = p;
  while (p < end && *p != ',' && *p != '}' && *p != ']' &&
         !isspace(static_cast<unsigned char>(*p))) ++p;
  if (p == start) return false;
  const size_t length = static_cast<size_t>(p - start);
  if ((length == 4 && strncmp(start, "true", 4) == 0) ||
      (length == 5 && strncmp(start, "false", 5) == 0) ||
      (length == 4 && strncmp(start, "null", 4) == 0)) return true;
  char number[64];
  if (length >= sizeof(number)) return false;
  memcpy(number, start, length);
  number[length] = '\0';
  char *after = nullptr;
  strtod(number, &after);
  return after == number + length;
}

bool rootSpan(const char *json, Span &span) {
  if (!json) return false;
  const char *end = json + strlen(json);
  const char *p = json;
  whitespace(p, end);
  span.begin = p;
  if (!valueToken(p, end, 0)) return false;
  span.end = p;
  whitespace(p, end);
  return p == end;
}

bool isNull(Span span) {
  return span.end - span.begin == 4 &&
         strncmp(span.begin, "null", 4) == 0;
}

MemberResult nextMember(const char *&cursor, Span object,
                        char *key, size_t keyCapacity, Span &value) {
  if (*object.begin != '{') return MemberResult::invalid;
  whitespace(cursor, object.end);
  if (cursor >= object.end) return MemberResult::invalid;
  if (*cursor == '}') return MemberResult::done;
  if (cursor != object.begin + 1) {
    if (*cursor++ != ',') return MemberResult::invalid;
    whitespace(cursor, object.end);
  }
  if (!stringToken(cursor, object.end, key, keyCapacity))
    return MemberResult::invalid;
  whitespace(cursor, object.end);
  if (cursor >= object.end || *cursor++ != ':') return MemberResult::invalid;
  whitespace(cursor, object.end);
  value.begin = cursor;
  if (!valueToken(cursor, object.end, 0)) return MemberResult::invalid;
  value.end = cursor;
  return MemberResult::found;
}

bool field(Span object, const char *name, Span &value) {
  if (*object.begin != '{') return false;
  const char *cursor = object.begin + 1;
  char key[80];
  while (true) {
    const MemberResult result = nextMember(cursor, object, key, sizeof(key), value);
    if (result == MemberResult::done) return false;
    if (result == MemberResult::invalid) return false;
    if (strcmp(key, name) == 0) return true;
  }
}

bool stringValue(Span span, char *output, size_t capacity) {
  const char *p = span.begin;
  return stringToken(p, span.end, output, capacity) && p == span.end;
}

bool numberValue(Span span, double &number) {
  const size_t length = static_cast<size_t>(span.end - span.begin);
  if (length == 0 || length >= 64) return false;
  char buffer[64];
  memcpy(buffer, span.begin, length);
  buffer[length] = '\0';
  char *after = nullptr;
  number = strtod(buffer, &after);
  return after == buffer + length && isfinite(number);
}

bool boolValue(Span span, bool &value) {
  if (span.end - span.begin == 4 && strncmp(span.begin, "true", 4) == 0) {
    value = true;
    return true;
  }
  if (span.end - span.begin == 5 && strncmp(span.begin, "false", 5) == 0) {
    value = false;
    return true;
  }
  return false;
}

bool validTime(const char *time, int &minuteOfDay) {
  if (strlen(time) != 5 || time[2] != ':' || !isdigit(time[0]) ||
      !isdigit(time[1]) || !isdigit(time[3]) || !isdigit(time[4])) return false;
  const int hour = (time[0] - '0') * 10 + time[1] - '0';
  const int minute = (time[3] - '0') * 10 + time[4] - '0';
  if (hour > 23 || minute > 59) return false;
  minuteOfDay = hour * 60 + minute;
  return true;
}
} // namespace

bool parseContractSchedules(const char *json, ContractSchedule *out,
                            size_t capacity, size_t &count) {
  count = 0;
  Span root;
  if (!rootSpan(json, root)) return false;
  if (isNull(root)) return true;
  if (*root.begin != '{') return false;
  const char *cursor = root.begin + 1;
  while (true) {
    Span item;
    char key[80];
    const MemberResult result = nextMember(cursor, root, key, sizeof(key), item);
    if (result == MemberResult::done) return true;
    if (result == MemberResult::invalid || count == capacity ||
        *item.begin != '{') return false;
    Span time, portion, enabled;
    char timeText[8];
    ContractSchedule &schedule = out[count];
    if (!field(item, "time", time) ||
        !field(item, "portionGrams", portion) ||
        !field(item, "enabled", enabled) ||
        !stringValue(time, timeText, sizeof(timeText)) ||
        !validTime(timeText, schedule.minuteOfDay) ||
        !numberValue(portion, schedule.portionGrams) ||
        schedule.portionGrams <= 0 ||
        !boolValue(enabled, schedule.enabled)) return false;
    strcpy(schedule.id, key);
    ++count;
  }
}

bool sumContractHistoryForDay(const char *json, const char *speciesId,
                              uint64_t dayStartEpoch, uint64_t nextDayEpoch,
                              double &grams) {
  grams = 0;
  Span root;
  if (!rootSpan(json, root)) return false;
  if (isNull(root)) return true;
  if (*root.begin != '{') return false;
  const char *cursor = root.begin + 1;
  while (true) {
    Span item;
    char key[80];
    const MemberResult result = nextMember(cursor, root, key, sizeof(key), item);
    if (result == MemberResult::done) return true;
    if (result == MemberResult::invalid || *item.begin != '{') return false;
    Span species, amount, timestamp;
    char itemSpecies[12];
    double itemGrams, itemEpoch;
    if (!field(item, "speciesId", species) ||
        !field(item, "actualGrams", amount) ||
        !field(item, "timestampEpoch", timestamp) ||
        !stringValue(species, itemSpecies, sizeof(itemSpecies)) ||
        !numberValue(amount, itemGrams) || itemGrams < 0 ||
        !numberValue(timestamp, itemEpoch) || itemEpoch < 0) return false;
    if (itemEpoch >= 1e12) itemEpoch /= 1000.0;
    if (strcmp(itemSpecies, speciesId) == 0 &&
        itemEpoch >= static_cast<double>(dayStartEpoch) &&
        itemEpoch < static_cast<double>(nextDayEpoch)) grams += itemGrams;
  }
}

uint64_t contractDayStartEpoch(uint64_t nowEpoch, int32_t utcOffsetSeconds) {
  if (nowEpoch == 0) return 0;
  const int64_t local = static_cast<int64_t>(nowEpoch) + utcOffsetSeconds;
  if (local < 0) return 0;
  return static_cast<uint64_t>((local / 86400) * 86400 - utcOffsetSeconds);
}

bool contractCommandIsFresh(uint64_t requestedAtEpoch, uint64_t nowEpoch,
                            uint32_t maxAgeSeconds,
                            uint32_t futureToleranceSeconds) {
  if (requestedAtEpoch == 0 || nowEpoch == 0) return false;
  if (requestedAtEpoch > nowEpoch)
    return requestedAtEpoch - nowEpoch <= futureToleranceSeconds;
  return nowEpoch - requestedAtEpoch <= maxAgeSeconds;
}
