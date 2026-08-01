import pages from "./routes/pages.js"
import auth from "./routes/auth.js"
import products from "./routes/product.js"
import payment from "./routes/payment.js"

const Server = function (app) {
    app.use("/", pages);
    app.use("/", auth);
    app.use("/products", products);
    app.use("/payment", payment);
};

export default Server;