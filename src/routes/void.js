/*
 * send information about next void
 */

import rpgEvent from '../core/RpgEvent';

export default (req, res) => {
  res.set({
    'Cache-Control': `public, max-age=${5 * 60}`,
  });

  if (rpgEvent.eventTimestamp) {
    const currentTime = new Date();
    const eventTime = new Date(rpgEvent.eventTimestamp);
    const timeDifference = Math.max(0, eventTime - currentTime);

    if (timeDifference === 0) {
      res.send('Void has either won or hasn\'t been announced yet');
    } else {
      const hours = Math.floor(timeDifference / (1000 * 60 * 60));
      const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

      let timeUntilEvent = '';
      if (hours > 0) {
        timeUntilEvent += `${hours} hours`;
      }
      if (minutes > 0) {
        if (timeUntilEvent) timeUntilEvent += ', ';
        timeUntilEvent += `${minutes} minutes`;
      }
      if (seconds > 0) {
        if (timeUntilEvent) timeUntilEvent += ', ';
        timeUntilEvent += `${seconds} seconds`;
      }

      res.send(`Void begins in ${timeUntilEvent}`);
    }
  } else {
    res.send('No void');
  }
}
