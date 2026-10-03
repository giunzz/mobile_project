#pragma once

#include <stddef.h>
#include <stdint.h>

// The Firebase client returns JSON text but does not include a JSON parser.
// Keep this small contract parser independent of Arduino so it can be tested
// on a computer before flashing the device.
struct ContractSchedule {
  char id[80];
  int minuteOfDay;
  double portionGrams;
  bool enabled;
};

bool parseContractSchedules(const char *json,
                            ContractSchedule *out,
                            size_t capacity,
                            size_t &count);

bool sumContractHistoryForDay(const char *json,
                              const char *speciesId,
                              uint64_t dayStartEpoch,
                              uint64_t nextDayEpoch,
                              double &grams);

uint64_t contractDayStartEpoch(uint64_t nowEpoch, int32_t utcOffsetSeconds);
bool contractCommandIsFresh(uint64_t requestedAtEpoch,
                            uint64_t nowEpoch,
                            uint32_t maxAgeSeconds,
                            uint32_t futureToleranceSeconds);
