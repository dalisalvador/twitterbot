var express = require("express");
var app = express();
const Twitter = require("twit");
const config = require("./config.js");
const fs = require("fs");
const client = new Twitter(config);
const axios = require("axios");
const traverson = require("traverson");
const JsonHalAdapter = require("traverson-hal");
const moment = require("moment");
const path = require("path"); // part of Node, no npm install needed
const promiseAllAlways = require("promise-all-always");
const { google } = require("googleapis");
const youtubedl = require("youtube-dl");
var ffmpeg = require("fluent-ffmpeg");
var TwitterB = require("twitter");

const clientID = "79abbea909cf4325223a",
  clientSecret = "f5502e776272b06294deb49206c3d743",
  apiUrl = "https://api.artsy.net/api/tokens/xapp_token";

// set the port of our application
// process.env.PORT lets the port be set by Heroku
var port = process.env.PORT || 8080;

// set the view engine to ejs
app.set("view engine", "ejs");

// make express look in the public directory for assets (css/js/img)
app.use(express.static(__dirname + "/public"));

// set the home page route
app.get("/", function(req, res) {
  // ejs render automatically looks in the views folder
  res.render("index");
});

app.listen(port, function() {
  console.log("Our app is running on http://localhost:" + port);
  go();
});

async function getTwits(twits, query, limit) {
  return await new Promise((resolve, reject) => {
    client.get("search/tweets", query, async function(err, data, response) {
      if (err) {
        reject(err);
      } else {
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

async function go() {
  let favCount = 0,
    retweetCount = 0;

  let commentLimit = 500;
  let favLimit = 1000;
  let retweeLimit = 12;

  // setInterval(async () => {
  //   let artworks = await getRandomArtworks(500);
  //   let artworkData = await getArtworkData(artworks);
  //   artist = await getArtistFromArtwork(artworkData.id);

  //   if (artist[0] != undefined) {
  //     artworkData.artist = artist[0].name;
  //     await tweetArtwork(artworkData);
  //   }
  // }, Math.floor(Math.random() * (10800000 - 3600000 + 1) + 3600000));

  youtube();
  keepAwake();

  while (1) {
    let twitsFound = await findTweets("#art", 1000);
    await favorite(twitsFound.favorite, favCount, favLimit, 90000, 120000);
  }
}

async function trimVideo(videoPath, start, end) {
  return new Promise((resolve, reject) => {
    let newPath = `./temp/tempVideo-Cut-${Date.now()}.mp4`;
    ffmpeg(videoPath)
      .setStartTime(start) //Can be in "HH:MM:SS" format also
      .setDuration(end)
      .on("error", function(err) {
        console.log("error: ", +err);
      })
      .on("end", function(err) {
        if (!err) {
          fs.unlinkSync(videoPath); //remove old video
          resolve(newPath);
        }
      })
      .saveToFile(newPath);
  });
}

async function youtube() {
  var youtube = google.youtube({
    version: "v3",
    auth: "AIzaSyDLhMU6pXkaHxLaB9IzAFUDK_eiQcosue0"
  });
  youtube.channels.list(
    { part: "contentDetails", forUsername: "LenaDanya", maxResults: 50 },
    function(err, response) {
      getChannelId(
        youtube,
        response.data.items[0].contentDetails.relatedPlaylists.uploads
      );
    }
  );
}

async function getChannelId(youtube, playListId) {
  youtube.playlistItems.list(
    {
      part: "snippet",
      playlistId: playListId,
      maxResults: 1
    },
    function(err, response) {
      getMostPopularVideos(youtube, response.data.items[0].snippet.channelId);
    }
  );
}

async function getMostPopularVideos(youtube, channelId) {
  youtube.search.list(
    {
      part: "snippet",
      channelId,
      maxResults: 50,
      order: "viewCount"
    },
    function(err, response) {
      uploadRandomVideo(response.data.items);
    }
  );
}

async function uploadRandomVideo(videosArr) {
  let onlyVideosArr = videosArr.filter(item => {
    if (item.id.kind == "youtube#video") return item;
  });

  let done = false;

  while (!done) {
    let randomVideo =
      onlyVideosArr[Math.floor(Math.random() * onlyVideosArr.length)];

    let response = await downloadVideo(randomVideo.id.videoId);
    let video = {};
    console.log(response);

    if (response.success) {
      video.path = response.path;
      video.title = randomVideo.snippet.title;
      video.trim = response.trim;
      video.link = response.link;
      await twitAndDeleteTempVideo(video);
      done = true;
    } else console.log("Error");
  }
}

async function downloadVideo(id) {
  var video = youtubedl(
    `http://www.youtube.com/watch?v=${id}`,
    // Optional arguments passed to youtube-dl.
    ["--format=18"],
    // Additional options can be given for calling `child_process.execFile()`.
    { cwd: __dirname }
  );

  const localname = `tempVideo-${Date.now()}`;

  let response = new Promise((resolve, reject) => {
    video.on("info", function(info) {
      console.log("Checking video: ", info._filename);
      if (info._duration_raw > 140) {
        //2:20 min
        video.pipe(fs.createWriteStream(`./temp/${localname}.mp4`));
        return video.on("end", async () => {
          console.log("Video too long. Trimming");
          let newPath = await trimVideo(`./temp/${localname}.mp4`, 0, 139);
          resolve({
            success: true,
            path: newPath,
            trim: true,
            link: `http://www.youtube.com/watch?v=${id}`
          });
        });
      } else {
        video.pipe(fs.createWriteStream(`./temp/${localname}.mp4`));
        return video.on("end", () => {
          console.log("video ok");
          resolve({
            success: true,
            path: `./temp/${localname}.mp4`,
            trim: false
          });
        });
      }
    });
  });

  return await response;
}

async function twitAndDeleteTempVideo(video) {
  // step ONE
  let promise = new Promise(async (resolve, reject) => {
    const PATH = path.join(__dirname, video.path);

    const res = await upload(PATH);
    const mediaIdStr = res.media_id_string;
    const meta_params = { media_id: mediaIdStr };

    //  step TWO
    client.post("media/metadata/create", meta_params, function(
      err,
      data,
      response
    ) {
      if (!err) {
        let status = video.title;
        if (video.trim) {
          status = status + `\nWatch full video: ${video.link}`;
        }

        const params = { status, media_ids: [mediaIdStr] };
        // step THREE
        client.post("statuses/update", params, function(err, tweet, response) {
          console.log("Video Tweeted!");
          fs.unlinkSync(video.path); // Deletes media from /tmp folder
          resolve();
        }); // end '/statuses/update'
      } // end if(!err)
    }); // end '/media/metadata/create'
  });

  return await promise;
}

async function upload(file) {
  return new Promise((resolve, reject) => {
    return client.postMediaChunked({ file_path: file }, async function(
      err,
      data,
      response
    ) {
      if (err) {
        reject(err);
      } else {
        let { processing_info } = data;
        let res;
        while (
          processing_info.state == "pending" ||
          processing_info.state == "in_progress"
        ) {
          await delay(processing_info.check_after_secs * 1000);
          res = await getNewStatus(data.media_id_string);
          processing_info = res.processing_info;
        }
        resolve(res);
      }
    });
  });
}

async function getNewStatus(mediaIdStr) {
  const clientB = new TwitterB({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  });
  return await new Promise((resolve, reject) => {
    clientB.get(
      "media/upload",
      { command: "STATUS", media_id: mediaIdStr },
      function(err, data, response) {
        resolve(data);
      }
    );
  });
}

function delay(ms) {
  return new Promise((resolve, reject) => {
    return setTimeout(() => {
      console.log("Waiting ", ms);
      resolve();
    }, ms);
  });
}

async function findTweets(keyword, limit) {
  let twits = [];
  let twitsFound = {
    retweet: [],
    comment: [],
    favorite: []
  };
  let now = moment().format("YYYY-MM-DD");
  let past = moment()
    .subtract(5, "days")
    .format("YYYY-MM-DD");

  let query = {
    q: `${keyword} since:${past} until:${now}`,
    count: 100,
    lang: "en"
  };

  await getTwits(twits, query, limit);
  twits.map(twit => {
    if (twit.retweeted_status == undefined) {
      //It's not a RT
      if (twit.favorite_count >= 100 && twit.retweet_count >= 20)
        twitsFound.retweet.push(twit);
      else if (twit.favorite_count >= 30 && twit.retweet_count >= 2)
        twitsFound.comment.push(twit);
      else if (twit.favorite_count >= 2 && twit.retweet_count >= 0)
        twitsFound.favorite.push(twit);
    } else {
      //It's a RT
      if (
        twit.retweeted_status.favorite_count >= 100 &&
        twit.retweeted_status.retweet_count >= 20
      )
        twitsFound.retweet.push(twit.retweeted_status);
      else if (
        twit.retweeted_status.favorite_count >= 30 &&
        twit.retweeted_status.retweet_count >= 2
      )
        twitsFound.comment.push(twit.retweeted_status);
      else if (
        twit.retweeted_status.favorite_count >= 2 &&
        twit.retweeted_status.retweet_count >= 0
      )
        twitsFound.favorite.push(twit.retweeted_status);
    }
  });

  return twitsFound;
}

async function favorite(twits, favCount, favLimit, minInterval, maxInterval) {
  let ms = 0;
  let promises = twits.map(twit => {
    return new Promise((resolve, reject) => {
      ms =
        ms +
        Math.floor(
          Math.random() * (maxInterval - minInterval + 1) + minInterval
        );

      return setTimeout(() => {
        if (favCount >= favLimit) {
          reject("Error: Fav Limit reached. Skipping");
        } else {
          client.post("favorites/create", { id: twit.id_str }, (err, res) => {
            if (err) reject(err);
            else {
              console.log("Fav count: ", ++favCount);
              resolve(favCount);
            }
          });
        }
      }, ms);
    });
  });

  await promiseAllAlways(promises).then(values => {
    for (let value of values) {
      if (!value.isResolved) console.log(`Result: ${value.result}`);
    }
  });
}

async function comment(
  twits,
  commentedTweets,
  commentsLimit,
  minInterval,
  maxInterval
) {
  let commentsArr = ["bravo!", "awesome!", "fantastic!", "magnificent!"];
  let comment = "";
  let ms = 0;

  let promises = twits.map(twit => {
    return new Promise((resolve, reject) => {
      comment = commentsArr[Math.floor(Math.random() * commentsArr.length)];
      ms =
        ms +
        Math.floor(
          Math.random() * (maxInterval - minInterval + 1) + minInterval
        );
      return setTimeout(() => {
        if (
          commentedTweets.length >= commentsLimit &&
          commentedTweets.includes(twit.id_str)
        ) {
          reject("Error. Skipping comment");
        } else {
          client.post(
            "statuses/update",
            {
              in_reply_to_status_id: twit.id_str,
              status: "@" + twit.user.screen_name + ` ${comment}`
            },

            (err, res) => {
              if (err) reject(err);
              else {
                commentedTweets.push(twit.id_str);
                resolve("Comment count: " + commentedTweets.length);
              }
            }
          );
        }
      }, ms);
    });
  });

  await promiseAllAlways(promises).then(values => {
    for (let value of values) {
      if (!value.isResolved) console.log(`Result: ${value.result}`);
    }
  });
}

function getMaxId(next_results) {
  let maxIdStart = next_results.indexOf("max_id=") + 7;
  let endOfId = next_results.indexOf("&", maxIdStart);
  let id = next_results.slice(maxIdStart, endOfId);
  return id;
}

async function tweetArtwork(artworkData) {
  var b64content = fs.readFileSync(artworkData.image, {
    encoding: "base64"
  });

  // first we must post the media to Twitter
  let promise = new Promise((resolve, reject) => {
    client.post("media/upload", { media_data: b64content }, function(
      err,
      data,
      response
    ) {
      if (err) console.log(err);
      // now we can assign alt text to the media, for use by screen readers and
      // other text-based presentations and interpreters
      var mediaIdStr = data.media_id_string;
      var altText = artworkData.title;
      var meta_params = { media_id: mediaIdStr, alt_text: { text: altText } };

      client.post("media/metadata/create", meta_params, function(
        err,
        data,
        response
      ) {
        if (err) console.log(err);
        if (!err) {
          // now we can reference the media and post a tweet (media will attach to the tweet)
          let medium = artworkData.medium
            ? `Medium: ${artworkData.medium}`
            : "";
          let category = artworkData.category
            ? `Category: ${artworkData.category}`
            : "";
          var params = {
            status: `${artworkData.title}, by ${artworkData.artist} (${
              artworkData.date
            }).\n${medium}\n${category}\n#art ${covertToHashTag(
              artworkData.artist
            )} ${covertToHashTag(artworkData.medium)} #iLoveArt`,
            media_ids: [mediaIdStr]
          };

          client.post("statuses/update", params, function(err, data, response) {
            if (!err) {
              console.log("Radom Artwork twitted!");
              fs.unlinkSync(artworkData.image);
              resolve();
            } else reject(err);
          });
        }
      });
    });
  });

  return await promise;
}

async function waiting(min, max) {
  let randomBetween = Math.floor(Math.random() * (max - min + 1) + min);
  let ms = randomBetween * 60 * 1000;
  console.log(`Waiting ${randomBetween} minutes before another post.`);
  let promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

  return await promise;
}

function covertToHashTag(text) {
  if (text) {
    let words = text.split(" ");
    words.map((word, index) => {
      words[index] = (word.charAt(0).toUpperCase() + word.slice(1)).replace(
        /[^0-9a-z]/gi,
        ""
      );
    });
    if (words.length > 0) {
      return "#" + words.join("");
    }
  } else return "";
}
async function getArtistFromArtwork(artwork_id) {
  let promise = new Promise((resolve, reject) => {
    axios
      .post(apiUrl, { client_id: clientID, client_secret: clientSecret })
      .then(res => {
        traverson.registerMediaType(JsonHalAdapter.mediaType, JsonHalAdapter);
        let api = traverson.from("https://api.artsy.net/api").jsonHal();
        api
          .newRequest()
          .follow("artists")
          .withRequestOptions({
            headers: {
              "X-Xapp-Token": res.data.token,
              Accept: "application/vnd.artsy-v2+json"
            }
          })
          .withTemplateParameters({ artwork_id })
          .getResource(function(error, res) {
            if (error) {
              reject(error);
            }
            if (res) {
              resolve(res._embedded.artists);
            }
          });
      });
  });

  return await promise;
}

async function getArtworkData(artworks) {
  let artwork = artworks[Math.floor(Math.random() * artworks.length)];
  let imageVersion,
    image = "";
  artwork.image_versions.map(version => {
    if (version == "large" && imageVersion == undefined) {
      imageVersion = version;
    }
    if (version == "medium" && imageVersion == undefined) {
      imageVersion = version;
    }
  });

  //if version not found
  if (imageVersion == undefined) return false;
  else {
    image = artwork._links.image.href;
    image = image.replace("{image_version}", imageVersion);
    image = await imgeUrl2File(image);
    return {
      id: artwork.id,
      title: artwork.title,
      category: artwork.category,
      medium: artwork.medium,
      date: artwork.date,
      image
    };
  }
}

async function imgeUrl2File(url) {
  const localname = `tempImage-${Date.now()}`;
  const PATH = `./temp/${localname}.jpg`;

  let promise = new Promise((resolve, reject) => {
    axios({
      url,
      responseType: "stream"
    }).then(response => {
      response.data
        .pipe(fs.createWriteStream(PATH))
        .on("finish", () => resolve(PATH))
        .on("error", e => reject(e));
    });
  });
  return await promise;
}

async function artistDuJour() {
  let randomArtists = await getRandomArtist(100);
  let artist = randomArtists[Math.floor(Math.random() * randomArtists.length)];
  return artist;
  //let artistId = artists[Math.floor(Math.random() * artists.length)];
  //return await getArtist(artistId);
}
async function getRandomArtworks(size) {
  let promise = new Promise((resolve, reject) => {
    axios
      .post(apiUrl, { client_id: clientID, client_secret: clientSecret })
      .then(res => {
        traverson.registerMediaType(JsonHalAdapter.mediaType, JsonHalAdapter);
        let api = traverson.from("https://api.artsy.net/api").jsonHal();
        api
          .newRequest()
          .follow("artworks")
          .withRequestOptions({
            headers: {
              "X-Xapp-Token": res.data.token,
              Accept: "application/vnd.artsy-v2+json"
            }
          })
          .withTemplateParameters({ size, page: 1 })
          .getResource(function(error, res) {
            if (error) {
              reject(error);
            }
            if (res) {
              resolve(res._embedded.artworks);
            }
          });
      });
  });

  return await promise;
}
async function getRandomArtist(size) {
  let promise = new Promise((resolve, reject) => {
    axios
      .post(apiUrl, { client_id: clientID, client_secret: clientSecret })
      .then(res => {
        traverson.registerMediaType(JsonHalAdapter.mediaType, JsonHalAdapter);
        let api = traverson.from("https://api.artsy.net/api").jsonHal();
        api
          .newRequest()
          .follow("artists")
          .withRequestOptions({
            headers: {
              "X-Xapp-Token": res.data.token,
              Accept: "application/vnd.artsy-v2+json"
            }
          })
          .withTemplateParameters({ size, sort: "-trending", page: 1 })
          .getResource(function(error, res) {
            if (error) {
              reject(error);
            }
            if (res) {
              resolve(res._embedded.artists);
            }
          });
      });
  });

  return await promise;
}

async function artworks(artist_id) {
  let promise = new Promise((resolve, reject) => {
    axios
      .post(apiUrl, { client_id: clientID, client_secret: clientSecret })
      .then(res => {
        traverson.registerMediaType(JsonHalAdapter.mediaType, JsonHalAdapter);
        let api = traverson.from("https://api.artsy.net/api").jsonHal();
        api
          .newRequest()
          .follow("artworks")
          .withRequestOptions({
            headers: {
              "X-Xapp-Token": res.data.token,
              Accept: "application/vnd.artsy-v2+json"
            }
          })
          .withTemplateParameters({ artist_id })
          .getResource(function(error, res) {
            if (error) {
              reject(error);
            }
            if (res) {
              resolve(res._embedded.artworks);
            }
          });
      });
  });

  return await promise;
}

async function getArtist(id) {
  let promise = new Promise((resolve, reject) => {
    axios
      .post(apiUrl, { client_id: clientID, client_secret: clientSecret })
      .then(res => {
        traverson.registerMediaType(JsonHalAdapter.mediaType, JsonHalAdapter);
        let api = traverson.from("https://api.artsy.net/api").jsonHal();
        api
          .newRequest()
          .follow("artist")
          .withRequestOptions({
            headers: {
              "X-Xapp-Token": res.data.token,
              Accept: "application/vnd.artsy-v2+json"
            }
          })
          .withTemplateParameters({ id })
          .getResource(function(error, res) {
            if (error) {
              reject(error);
            }
            if (res) {
              resolve(res);
            }
          });
      });
  });
  return await promise;
}

function keepAwake() {
  setInterval(function() {
    axios.get("http://daliweb.herokuapp.com");
  }, 60000); // every 5 minutes (300000)
}
