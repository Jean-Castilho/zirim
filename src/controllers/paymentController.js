

import { getDataBase } from "../config/db.js";

export  default class PaymentController {
    getSelection () {
        const db = getDataBase();
        return db.collection("payments")
    }

    async creatpayment(req,res) {

    }

}