import BaseController from "./BaseController.js";
import UserService from "../services/UserService.js";
import { ValidationError } from "../utils/errors.js";
import { requireSessionUser, saveSession, toSessionUser } from "../utils/session.js";

/**
 * Verificação de contato (OTP por e-mail e por telefone/WhatsApp).
 */
export default class VerificationController extends BaseController {
    constructor(userService = new UserService()) {
        super();
        this.users = userService;
    }

    async sendEmailOtp(req, res) {
        await this.users.sendEmailVerificationCode(req.session?.user);
        return this.ok(res, "Código de verificação enviado para o e-mail da sua conta.");
    }

    async verifyEmailOtp(req, res) {
        const { email, otp } = req.body;
        const user = await this.users.verifyEmailCode(req.session?.user, email, otp);

        req.session.user = toSessionUser(user);
        await saveSession(req);

        return this.ok(res, "Email verificado com sucesso!", { redirect: "/" });
    }

    async sendPhoneOtp(req, res) {
        const sessionUser = requireSessionUser(req);

        const result = await this.users.requestPhoneVerification(sessionUser._id, req.body.phone);
        if (result.alreadyVerified) {
            req.session.phoneVerificationNumber = null;
            return this.ok(res, "Este número já está verificado.", { verified: true });
        }

        req.session.phoneVerificationNumber = result.phone;
        return this.ok(res, "Código de verificação enviado pelo WhatsApp.");
    }

    async verifyPhoneOtp(req, res) {
        const sessionUser = requireSessionUser(req);

        const phone = String(req.body.phone || "").trim();
        if (req.session.phoneVerificationNumber !== phone) {
            throw new ValidationError("Solicite um novo código para este número.");
        }

        const user = await this.users.verifyPhoneNumber(sessionUser._id, phone, req.body.otp);
        req.session.user.phone = user.phone;
        req.session.phoneVerificationNumber = null;

        return this.ok(res, "Número de telefone verificado com sucesso.");
    }
}
