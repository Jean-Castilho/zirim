import pages from "./routes/pages.js";
import auth from "./routes/auth.js";
import products from "./routes/product.js";
import orders from "./routes/orders.js";

const Server = function (app) {
    app.use("/", pages);
    app.use("/", auth);
    app.use("/products", products);
    app.use("/orders", orders);
};

export default Server;