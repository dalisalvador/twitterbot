var express = require("express");
/////// WebHooks //////////
const bodyParser = require("body-parser");
const twitterWebhooks = require("twitter-webhooks");
const https = require("https");
/**************************/

var app = express();
const Twitter = require("twit");
const config = require("./config.js");
const fs = require("fs");
//const client = new Twitter(config);
const artists = require("./artistis/artists");

const axios = require("axios");
const traverson = require("traverson");
const JsonHalAdapter = require("traverson-hal");
const path = require("path"); // part of Node, no npm install needed

const clientID = "79abbea909cf4325223a",
  clientSecret = "f5502e776272b06294deb49206c3d743",
  apiUrl = "https://api.artsy.net/api/tokens/xapp_token";

// set the port of our application
// process.env.PORT lets the port be set by Heroku
var port = process.env.PORT || 8080;

// /* WebHooks */
app.use(bodyParser.json());

const userActivityWebhook = twitterWebhooks.userActivity({
  serverUrl: "https://daliweb.herokuapp.com/",
  route: "/", //default : '/'
  consumerKey: "faTuC9hQ8lgTwMUh7dCyVmwQB",
  consumerSecret: "U3W6Vq0KHnC8BDK2HRMftZvfikHJRUSQ1U5XAWGBASZl3laUqQ",
  accessToken: "1147107023907106817-Zvbb8T8rpzHw5znO4SaLz8f3fJT60c",
  accessTokenSecret: "LUE4zfZMktvIEGh8SXnm65a8bTfPV2pmwlNHGUUVGzMJw",
  environment: "env-beta", //default : 'env-beta'
  app
});

//Register your webhook url - just needed once per URL
userActivityWebhook.register();

// Subscribe for a particular user activity
userActivityWebhook
  .subscribe({
    userId: "art___you",
    accessToken: "1147107023907106817-Zvbb8T8rpzHw5znO4SaLz8f3fJT60c",
    accessTokenSecret: "LUE4zfZMktvIEGh8SXnm65a8bTfPV2pmwlNHGUUVGzMJw"
  })
  .then(function(userActivity) {
    userActivity
      .on("favorite", data => console.log(userActivity.id + " - favorite"))
      .on("tweet_create", data =>
        console.log(userActivity.id + " - tweet_create")
      )
      .on("follow", data => console.log(userActivity.id + " - follow"))
      .on("mute", data => console.log(userActivity.id + " - mute"))
      .on("revoke", data => console.log(userActivity.id + " - revoke"))
      .on("direct_message", data =>
        console.log(userActivity.id + " - direct_message")
      )
      .on("direct_message_indicate_typing", data =>
        console.log(userActivity.id + " - direct_message_indicate_typing")
      )
      .on("direct_message_mark_read", data =>
        console.log(userActivity.id + " - direct_message_mark_read")
      )
      .on("tweet_delete", data =>
        console.log(userActivity.id + " - tweet_delete")
      );
  });

//listen to any user activity
userActivityWebhook.on("event", (event, userId, data) =>
  console.log(userId + " - favorite")
);

//listen to unknown payload (in case of api new features)
userActivityWebhook.on("unknown-event", rawData => console.log(rawData));

// const server = https.createServer(options, app);

// server.listen(443);

/*** End WebHooks ***/

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
  //go();
});

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

async function go() {
  let favCount = 0;
  let artist;
  let artistArtworks = [];
  let artistsArr = [];

  //set interval to keep awake
  keepAwake();
  favs(
    "#art, #painting, #paintings, #drawing, #drawings, #andywarhol, #pablopicasso,#banksy,#keithharing,#takashimurakami,#roylichtenstein,#damienhirst,#francisbacon,#aiweiwei,#leonardodavinci,#vincentvangogh,#rembrandtvanrijn,#paolouccello,#paulcezanne,#wassilykandinsky,#claudemonet,#paulgauguin,#vincentvangogh,#edouardmanet,#edvardmunch,#pierodellafrancesca,#masaccio",
    10000
  );

  while (1) {
    // while (1) {
    //   artist = await artistDuJour();
    //   artistArtworks = await artworks(artist.id);
    //   console.log(`artWork of ${artist.name} :`, artistArtworks);
    //   if (artistArtworks.length >= 1) break;
    // }

    artworks = await getRandomArtworks(500);
    let artworkData = await getArtworkData(artworks);
    artist = await getArtistFromArtwork(artworkData.id);

    if (artist[0] != undefined) {
      artworkData.artist = artist[0].name;
      //await tweetArtwork(artworkData);
      await waiting(1800000);
    }

    // if (!artistsArr.includes(artist.name)) {
    //   if (artistsArr.length >= 10) artistsArr = [];
    //   artistsArr.push(artist.name);
    //   let artworkData = await getArtworkData(artistArtworks);
    //   artworkData.artist = artist.name;
    //   await tweetArtwork(artworkData);
    //   //await waiting(900000);
    //   await waiting(60000);
    // }
  }
}

async function favs(track, ms) {
  let favCount = 0;
  var stream = client.stream("statuses/filter", { track });
  stream.on("tweet", async function(tweet) {
    // console.log("Waiting to Fav");
    // await waiting(ms);
    client.post("favorites/create", { id: tweet.id_str }, (err, res) => {
      if (err) console.log(err);
      else {
        console.log(tweet);
        console.log("Fav count: ", favCount++);
      }
    });
  });
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

async function waiting(ms) {
  console.log("waiting...");
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
