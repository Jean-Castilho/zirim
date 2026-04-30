import pages from "./routes/pages.js"

const Server = function (app) {
    app.use("/", pages)
};

export default Server;