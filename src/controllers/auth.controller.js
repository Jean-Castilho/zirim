import BaseController from "./base.controller.js";
import UserService from "../services/user.service.js";
import { createToken } from "../services/auth.service.js";
import { isHtmxRequest, sendSuccess } from "../utils/handle-response.js";
import { regenerateSession, saveSession, requireSessionUser, toSessionUser } from "../utils/session.js";

/**
 * Autenticação e credenciais: login, cadastro, logout, troca e recuperação de senha.
 */
export default class AuthController extends BaseController {
    constructor(userService = new UserService()) {
        super();
        this.users = userService;
    }

    /** Cria uma sessão nova (anti session-fixation) e emite o cookie JWT. */
    async #startSession(req, res, user, status, message) {
        await regenerateSession(req);

        const sessionUser = toSessionUser(user);
        req.session.user = sessionUser;
        await saveSession(req);

        const token = createToken({ _id: sessionUser._id, email: sessionUser.email?.endereco });
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
        });

        return sendSuccess(res, { status, message, data: { user: sessionUser } });
    }

    async login(req, res) {
        const { email, password } = req.body;
        const user = await this.users.authenticate(email, password);
        return this.#startSession(req, res, user, 200, "Login realizado");
    }

    async register(req, res) {
        const user = await this.users.registerUser(req.body);
        return this.#startSession(req, res, user, 201, "Usuario registrado com sucesso");
    }

    async logout(req, res) {
        await new Promise((resolve, reject) =>
            req.session.destroy((error) => (error ? reject(error) : resolve()))
        );
        res.clearCookie("connect.sid");
        res.clearCookie("token");

        if (isHtmxRequest(req)) {
            res.set("HX-Redirect", "/");
            return this.empty(res);
        }
        return res.redirect("/");
    }

    async forgotPassword(req, res) {
        await this.users.requestPasswordReset(req.body.email);
        return this.ok(
            res,
            "Se o e-mail informado estiver cadastrado, você receberá um link de redefinição em breve."
        );
    }

    async passwordReset(req, res) {
        const { token, password, confirmPassword } = req.body;
        await this.users.completePasswordReset(token, password, confirmPassword);
        return this.ok(res, "Senha redefinida com sucesso.", { redirect: "/login" });
    }

    async updatePassword(req, res) {
        const user = requireSessionUser(req);
        const { currentPassword, password, confirmPassword } = req.body;
        await this.users.changePassword(user._id, currentPassword, password, confirmPassword);
        return this.ok(res, "Senha atualizada com sucesso.");
    }
}
