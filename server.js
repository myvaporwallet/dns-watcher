require("dotenv").config();
const fs = require("fs");
const path = require("path");
const events = require("events");
const express = require("express");
const https = require("https");
const clone = require("clone");
const request = require("request-promise-native");

const Runner = require("./runner");
const nameservers = require("./ns_all.json");
const countryListing = require("./raw_lists/country_List");
const logger = require("./logger");

const runner = new Runner(nameservers);
const app = express();
const emitter = new events.EventEmitter();

const DNS_LIST_URL = process.env.DNS_LIST_URL || "https://public-dns.info/nameservers.csv";
runner.setEmitter(emitter);

let resultBkup;

const options = {
    key: fs.readFileSync(path.join(__dirname, process.env.HTTPS_KEY_FILE)),
    cert: fs.readFileSync(path.join(__dirname, process.env.HTTPS_CERT_FILE)),
    rejectUnauthorized: process.env.STATUS === "production"
};

const server = https.createServer(options, app);

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server Listening on Port ${port}`);
    getAndParseDNSList()
        .then(next => {
            logger.info("Initial Run Start");
            runner.run();
        })
        .catch(err => {
            logger.error(err);
        })

});


app.use("/static", express.static(path.join(__dirname, "MewChecker/dist/static")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "MewChecker/dist/index.html"));
});

app.get("/country-list", (req, res) => {
    res.send(countryListing.name);
});

app.get("/dns-report", (req, res) => {
    let filepath = path.join(__dirname, process.env.DNS_RESULT_FILE);
    try {
        fs.access(filepath, fs.constants.R_OK | fs.constants.W_OK, (err) => {
            if (err) {
                res.send("{\"timestamp\": \"" + new Date().toUTCString() + "\",\"good\":[\"building initial list\"], \"bad\":[\"building initial list\"]}");
            } else {
                res.sendFile(filepath);
            }
        });
    } catch (e) {
        logger.error(e);
    }
});

app.get("/new-results", (req, res) => {
    let filepath = path.join(__dirname, process.env.DNS_RESULT_FILE);
    try {
        fs.access(filepath, fs.constants.R_OK | fs.constants.W_OK, (err) => {
            if (err) {
                res.send("{\"timestamp\": \"" + new Date().toUTCString() + "\",\"good\":[\"building initial list\"], \"bad\":[\"building initial list\"]}");
            } else {
                fs.readFile(filepath, "utf-8", (err, result) => {
                    try {
                        if(err) throw err;
                        let jsonResult = JSON.parse(result);
                        let displayedList = req.query.timestamp;
                        let currentList = Date.parse(jsonResult.timestamp);
                        if (+currentList > +displayedList) {
                            res.send({result: true});
                        } else {
                            res.send({result: false});
                        }
                    } catch (e) {
                        logger.error(e);
                    }
                })
            }
        });
    } catch (e) {
        logger.error(e);
    }
});

// 404 handlerish
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
    logger.warn(`INVALID ROUTING ATTEMPT: {hostname: ${req.hostname}, ip: ${req.ip}, originalUrl: ${req.originalUrl}, error: ${err}}`);
    res.status(err.status || 500);
});


emitter.on("end", (results) => {
    //todo uncomment after dev
    logger.info("Run Complete.");
    fs.writeFileSync(path.join(__dirname, process.env.DNS_RESULT_FILE), JSON.stringify(results), (error) => {
        if (error) {
            logger.error("Name server results save Failed. ", error);
            resultBkup = clone(results);
        } else {
            resultBkup = null;
        }
    });
    getAndParseDNSList()
        .then(next => {
            //todo remove dev item
            setTimeout(() => {
                runner.run();
            }, 10000)
            // runner.run(); //todo uncomment after dev
        })
        .catch(err => {
            logger.error("Updating NameServer list failed", err);
            logger.error("Proceeding with existing nameserver list");
            logger.error("Restarting Run.");
            runner.run();
        })
});



function getAndParseDNSList(){
   return request(DNS_LIST_URL)
        .then(result => {
            let locations = [];
            let split = result.split("\n");
            logger.info("Updating NameServer list. Restarting Run.");
            for (let i = 1; i < split.length; i++) {
                try {
                    let row = split[i].replace("\r", "").split(",");
                    if(row.length >= 8) locations.push([row[0], row[2], row[1]]);

                } catch (e) {
                    logger.error(e);
                }
            }
            runner.setNameservers(locations);
        })
}