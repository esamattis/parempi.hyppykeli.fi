
var hyperquest = require("hyperquest");
var concat = require('concat-stream');
var express = require("express");
var Q = require("q");

var config = require("./config.json");
var formatFmiUrl = require("./formatFmiUrl");
var parseObservations = require("./parseObservations");
var cachePromise = require("./cachePromise");
var Weather = require("./client/Weather");

// http://ilmatieteenlaitos.fi/tallennetut-kyselyt

var app = express();

app.use(express.static(__dirname + '/public'));


var promiseObservations = function (query) {
    var d = Q.defer();

    var fmiUrl = formatFmiUrl({
        apikey: config.apikey,
        query: query
    });

    console.log("API request to", fmiUrl);
    var start = Date.now();
    var s = hyperquest(fmiUrl);

    s.on("error", d.reject);
    s.pipe(concat(function(data) {
        console.log("request took", Date.now() - start, "ms");
        d.resolve(parseObservations(data.toString()));
    }));

    return d.promise;
};

promiseObservations = cachePromise(promiseObservations, function(observations) {
    var d = Q.defer();

    observations.then(function(data) {
        var weather = new Weather(data);
        if (weather.isDataOld()) d.reject();
        else d.resolve();
    }, d.reject);

    return d.promise;
});

app.get("/api/observations", function(req, res) {
    promiseObservations(req.query).then(function(json) {
        res.json(json);
    }, function(err) {
        res.json(500, err);
    });
});

app.get("/", function(req, res) {
    res.sendfile(__dirname + "/html/index.html");
});

app.get("/:key/:value", function(req, res) {
    res.sendfile(__dirname + "/html/app.html");
});


app.listen(8080, function() {
    console.log("Listening on http://localhost:8080");
});
