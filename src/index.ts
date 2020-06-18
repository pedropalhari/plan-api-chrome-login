import "source-map-support/register";
import puppeteer from "puppeteer-core";
import moment from "moment";
import { spawn } from "child_process";
import fastify from "fastify";

//launching a chrome with user-data-dir, then with remote-debugging and user-data-dir
//google-chrome --remote-debugging-port=9222 --user-data-dir=remote-profile2

interface ScheduleItem {
  start: string;
  end: string;
  name: string;
}

let lastScheduleFetch = moment("01/04/1997", "DD/MM/YYYY");
let mySchedule: ScheduleItem[];

let globalPage: puppeteer.Page;

async function startPuppeteerAndGoToPage() {
  //Spawn chrome and connect puppeteer to it. This chrome was previously spawned on my computer without
  //--remote-debugging so I could add my Google account to it.
  let chromeDebugWSEndpoint: string = await new Promise((res) => {
    const gchrome = spawn("google-chrome", [
      "--remote-debugging-port=9222",
      "--user-data-dir=remote-profile2",
    ]);

    gchrome.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`);
      parseMessage(data.toString());
    });

    gchrome.stderr.on("data", (data) => {
      console.log(`stderr: ${data}`);
      parseMessage(data.toString());
    });

    function parseMessage(message: string) {
      if (message.includes("DevTools listening on ")) {
        console.log(message);
        res(message.split("DevTools listening on ")[1]);
      } else return null;
    }
  });

  //Connect puppeteer with it
  const browser = await puppeteer.connect({
    browserWSEndpoint: chromeDebugWSEndpoint,
    defaultViewport: {
      width: 1500,
      height: 600,
    },
  });

  //Do puppeteery-stuff, get my daily schedule
  globalPage = await browser.newPage();

  await globalPage.goto("https://getplan.co/today");
  await globalPage.waitForSelector("div.event-details");
}

async function getMyScheduleFromChrome() {
  let links: string[][] = await globalPage.evaluate(() => {
    //@ts-ignore
    return (
      Array.from(document.querySelectorAll("div.event-details"))
        //@ts-ignore
        .map((x) => x.innerText.split("\n"))
    );
  });

  let linksObject = links.map((link) => {
    let timeStart = moment(link[0], "hhA");
    let timeSpent = link[2].split("h")[0];
    let timeSpentInt = parseInt(timeSpent);
    let timeEnd = moment(timeStart).add(timeSpentInt, "hours");

    return {
      start: timeStart.format("HH:mm"),
      end: timeEnd.format("HH:mm"),
      name: link[5],
    };
  });

  //set it as a global var, also the date I used to get this schedule.
  lastScheduleFetch = moment();
  mySchedule = linksObject;
}

// I like APIs, APIs are good.

const app = fastify();
app.get("/schedule", async (req, res) => {
  //More than 1 hour? Oopsie it might be out of date, get it again.
  console.log(lastScheduleFetch.diff(moment(), "hours"));
  await getMyScheduleFromChrome();

  res.send(mySchedule);
});

startPuppeteerAndGoToPage();
app.listen(8800, "0.0.0.0", function (err, address) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(`server listening on ${address}`);
});
