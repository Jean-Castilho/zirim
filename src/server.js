import pages from "./routes/pages.js"
import auth from "./routes/auth.js"

const Server = function (app) {
    app.use("/", pages);
    app.use("/", auth);
};

export default Server;