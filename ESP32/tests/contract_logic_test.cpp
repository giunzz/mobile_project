#include "../contract_logic.h"

#include <assert.h>
#include <math.h>
#include <string.h>

int main() {
  ContractSchedule schedules[4]{};
  size_t count = 0;
  assert(parseContractSchedules(
      R"({"schedule-01":{"time":"07:00","portionGrams":80,"enabled":true},"schedule-02":{"time":"18:30","portionGrams":45,"enabled":false}})",
      schedules, 4, count));
  assert(count == 2);
  assert(strcmp(schedules[0].id, "schedule-01") == 0);
  assert(schedules[0].minuteOfDay == 420 && schedules[0].enabled);
  assert(schedules[1].minuteOfDay == 1110 && !schedules[1].enabled);
  assert(!parseContractSchedules(
      R"({"bad":{"time":"25:00","portionGrams":80,"enabled":true}})",
      schedules, 4, count));
  assert(parseContractSchedules("null", schedules, 4, count));
  assert(count == 0);

  const uint64_t dayStart = contractDayStartEpoch(1788890000, 7 * 3600);
  assert(dayStart > 0);
  double grams = 0;
  const char *history =
      R"({"a":{"speciesId":"dog","actualGrams":79.5,"timestampEpoch":1788890000,"result":"completed"},"b":{"speciesId":"dog","actualGrams":2.5,"timestampEpoch":1788890000000,"result":"failed"},"c":{"speciesId":"cat","actualGrams":45,"timestampEpoch":1788890000},"d":{"speciesId":"dog","actualGrams":20,"timestampEpoch":1788800000}})";
  assert(sumContractHistoryForDay(history, "dog", dayStart,
                                  dayStart + 86400, grams));
  assert(fabs(grams - 82.0) < 0.001);
  assert(!sumContractHistoryForDay("{broken", "dog", dayStart,
                                   dayStart + 86400, grams));
  assert(sumContractHistoryForDay("null", "dog", dayStart,
                                  dayStart + 86400, grams));
  assert(grams == 0);

  assert(contractCommandIsFresh(1788890000, 1788890100, 120, 30));
  assert(!contractCommandIsFresh(1788890000, 1788890121, 120, 30));
  assert(contractCommandIsFresh(1788890010, 1788890000, 120, 30));
  assert(!contractCommandIsFresh(0, 1788890000, 120, 30));
}
