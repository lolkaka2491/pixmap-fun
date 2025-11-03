/*
 * LogIn Form
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import { useSelector, shallowEqual, useDispatch } from 'react-redux';
import { t } from 'ttag';

import { dateToString, getToday } from '../core/utils';
import { selectHistoricalTime } from '../store/actions';
import { requestHistoricalTimes } from '../store/actions/fetch';

function stringToDate(dateString) {
  if (!dateString) return '';
  // YYYYMMDD -> YYYY-MM-DD
  return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6)}`;
}

function stringToTime(timeString) {
  if (!timeString) return '';
  // HHMM -> HH:MM
  return `${timeString.substring(0, 2)}:${timeString.substring(2)}`;
}

const HistorySelect = () => {
  const dateSelect = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [times, setTimes] = useState([]);
  const [max] = useState(getToday());

  const [
    canvasId,
    canvasStartDate,
    canvasEndDate,
    historicalDate,
    historicalTime,
  ] = useSelector((state) => [
    state.canvas.canvasId,
    state.canvas.canvasStartDate,
    state.canvas.canvasEndDate,
    state.canvas.historicalDate,
    state.canvas.historicalTime,
  ], shallowEqual);

  const dispatch = useDispatch();

  const setTime = useCallback((date, time) => {
    const timeString = time.substring(0, 2) + time.substring(3, 5);
    const dateString = dateToString(date);
    dispatch(selectHistoricalTime(dateString, timeString));
  }, [dispatch]);

  // Load available times when historicalDate changes, to restore state
  useEffect(() => {
    if (!historicalDate) return;
    (async () => {
      setSubmitting(true);
      const isoDate = stringToDate(historicalDate);
      const available = await requestHistoricalTimes(isoDate, canvasId);
      if (available?.length) {
        setTimes(available);
      }
      setSubmitting(false);
    })();
  }, [historicalDate, canvasId]);

  const handleDateChange = useCallback(async (evt) => {
    if (submitting) return;
    setSubmitting(true);
    const date = evt.target.value;
    const available = await requestHistoricalTimes(date, canvasId);
    if (available?.length) {
      setTimes(available);
      // pick first time for new date
      setTime(date, available[0]);
    }
    setSubmitting(false);
  }, [submitting, canvasId, setTime]);

  const changeTime = useCallback(async (diff) => {
    if (!times.length || !dateSelect.current?.value) return;

    let available = times;
    let pos = times.indexOf(stringToTime(historicalTime)) + diff;
    let selectedDate = dateSelect.current.value;

    if (pos < 0 || pos >= available.length) {
      setSubmitting(true);
      // step date up/down
      dateSelect.current[pos < 0 ? 'stepDown' : 'stepUp'](1);
      selectedDate = dateSelect.current.value;
      available = await requestHistoricalTimes(selectedDate, canvasId);
      setSubmitting(false);
      if (!available?.length) return;
      pos = pos < 0 ? available.length - 1 : 0;
    }

    setTimes(available);
    setTime(selectedDate, available[pos]);
  }, [historicalTime, times, canvasId, setTime]);

  const selectedDate = stringToDate(historicalDate);
  const selectedTime = stringToTime(historicalTime);

  return (
    <div id="historyselect">
      <input
        type="date"
        pattern="\d{4}-\d{2}-\d{2}"
        key="dateinput"
        value={selectedDate}
        min={canvasStartDate}
        max={canvasEndDate || max}
        ref={dateSelect}
        onChange={handleDateChange}
      />
      <div key="timeselcon">
        { !!times.length && historicalTime && !submitting ? (
          <div key="timesel">
            <button
              type="button"
              className="hsar"
              onClick={() => changeTime(-1)}
            >←</button>
            <select
              value={selectedTime}
              onChange={(evt) => setTime(selectedDate, evt.target.value)}
            >
              {times.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="hsar"
              onClick={() => changeTime(1)}
            >→</button>
          </div>
        ) : submitting ? (
          <p>{`${t`Loading`}...`}</p>
        ) : (
          <p>{t`Select Date above`}</p>
        ) }
      </div>
    </div>
  );
};

export default React.memo(HistorySelect);
