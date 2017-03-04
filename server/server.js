const Koa = require("koa");
const router = require("koa-router")();
const serveStatic = require("koa-static");

const config = require("../config");

const app = new Koa();

const metar = require("./metar");
const observations = require("./observations");

app.use((ctx, next) => {
    ctx.state.fmiApikey = config.fmiApikey;
    return next();
});

app.use(metar.routes());
app.use(observations.routes());

app.use(serveStatic("static"));

app.use(router.allowedMethods());

app.listen(8080);
console.log("Listening 8080");
