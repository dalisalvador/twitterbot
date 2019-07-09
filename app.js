const Twitter = require("twit");
const config = require("./config.js");
const fs = require("fs");
const client = new Twitter(config);
const artists = require("./artistis/artists");
const axios = require("axios");
const traverson = require("traverson");
const JsonHalAdapter = require("traverson-hal");
const path = require("path"); // part of Node, no npm install needed

const clientID = "79abbea909cf4325223a",
  clientSecret = "f5502e776272b06294deb49206c3d743",
  apiUrl = "https://api.artsy.net/api/tokens/xapp_token";

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
  let artist;
  let artistArtworks = [];
  let artistsArr = [];
  while (1) {
    while (1) {
      artist = await artistDuJour();
      artistArtworks = await artworks(artist.id);
      if (artistArtworks.length >= 1) break;
    }

    if (!artistsArr.includes(artist.name)) {
      if (artistsArr.length >= 10) artistsArr = [];
      artistsArr.push(artist.name);
      let artworkData = await getArtworkData(artistArtworks);
      artworkData.artist = artist.name;
      await tweetArtwork(artworkData);
      await waiting(900000);
      //await waiting(60000);
    }
  }
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
        if (!err) {
          // now we can reference the media and post a tweet (media will attach to the tweet)
          var params = {
            status: `${artworkData.title}, by ${artworkData.artist} (${
              artworkData.date
            }).\nMedium: ${artworkData.medium}\nCategory: ${
              artworkData.category
            }\n#${covertToHashTag(artworkData.artist)} #${covertToHashTag(
              artworkData.medium
            )} #iLoveArt`,
            media_ids: [mediaIdStr]
          };

          client.post("statuses/update", params, function(err, data, response) {
            if (!err) {
              console.log("twitted!");
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
  let words = text.split(" ");
  words.map((word, index) => {
    words[index] = (word.charAt(0).toUpperCase() + word.slice(1)).replace(
      /[^0-9a-z]/gi,
      ""
    );
  });
  return words.join("");
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
  const PATH = path.join(__dirname, `./temp/${localname}.jpg`);

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
  let artistId = artists[Math.floor(Math.random() * artists.length)];
  return await getArtist(artistId);
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

go();
