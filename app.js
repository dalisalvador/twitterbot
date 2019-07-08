const Twitter = require("twit");
const config = require("./config.js");
const client = new Twitter(config);

async function getTwits(twits, query, limit) {
  return await new Promise((resolve, reject) => {
    client.get("search/tweets", query, async function(err, data, response) {
      if (err) reject(err);
      else {
        data.statuses.map(x => {
          if (twits.length < limit) twits.push(x);
        });
        if (data.search_metadata.next_results && twits.length < limit) {
          let newQuery = {
            q: query.q,
            count: query.count,
            max_id: getMaxId(data.search_metadata.next_results)
          };
          // let newTwits = await waitBeforeRequest(twits, delay, newQuery, limit);
          let newTwits = await getTwits(twits, newQuery, limit);
          newTwits.map(x => {
            if (twits.length < limit) twits.push(x);
            else resolve(twits);
          });
        } else {
          resolve(twits);
        }
      }
    });
  });
}

// async function waitBeforeRequest(twits, delay, query, limit) {
//   return await new Promise((resolve, reject) => {
//     setTimeout(async () => {
//       resolve(getTwits(twits, delay, query, limit));
//     });
//   });
// }

function getMaxId(next_results) {
  let maxIdStart = next_results.indexOf("max_id=") + 7;
  let endOfId = next_results.indexOf("&", maxIdStart);
  let id = next_results.slice(maxIdStart, endOfId);
  return id;
}

async function go() {
  let query = {
    q: "#salvadordali since:2019-07-04",
    count: 100
  };

  let Twits = [];
  let reps = [];
  Twits = await getTwits(Twits, query, 5);

  // console.log(Twits.length);
  Twits.map(x => console.log(`- ${x.text} (${x.user.name})`));
}

go();
