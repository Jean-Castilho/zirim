import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import UserRepository from "../repository/UserRepository.js";
import { ValidationError, GeneralError, NotFoundError, ConflictError, UnauthorizedError } from "../utils/errors.js";
import { compararPassword, createHashPassword } from "./authServices.js";
import { validateUser, assertEmail, assertNewPassword, normalizeEmail } from "./validationData.js";
import { sendWhatsAppOtp, sendEmailOtp, sendPasswordResetEmail } from "./contactService.js";
import { verifyOtpCode } from "./otpService.js";

const ALLOWED_ROLES = ["user", "entregador", "admin"];
const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1000;
const hashResetToken = (token) => createHash("sha256").update(token).digest("hex");

export default class UserService {
    constructor() {
        this.repository = new UserRepository();
    }

    async authenticate(email, password) {
        const user = await this.repository.findByEmailForAuth(email);
        if (!user || user.isActive === false) {
            throw new ValidationError("Email ou senha incorretos.");
        }

        const isMatch = await compararPassword(password, user.password);
        if (!isMatch) throw new ValidationError("Email ou senha incorretos.");

        const authenticatedUser = { ...user };
        delete authenticatedUser.password;
        return authenticatedUser;
    }

    async registerUser(userData) {
        const validation = validateUser(userData);
        if (!validation.isValid) {
            throw new ValidationError(validation.errors[0].message, validation.errors);
        }

        const data = validation.data;

        const emailExists = await this.repository.findByEmail(data.email);
        if (emailExists) throw new ConflictError("Este e-mail já está sendo utilizado.");

        const phoneExists = await this.repository.findByPhone(data.phone);
        if (phoneExists) throw new ConflictError("Este número de telefone já está sendo utilizado.");

        data.password = await createHashPassword(data.password);
        return await this.repository.create(data);
    }

    async verifyAndUpgradeUser(userId) {
        const updated = await this.repository.updateProfile(userId, { emailVerified: true });
        if (!updated) throw new GeneralError("Falha ao atualizar status de verificação.", 500);
        return await this.repository.findById(userId, { password: 0 });
    }

    async requestPhoneVerification(userId, phone) {
        const normalizedPhone = String(phone || "").trim();
        if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
            throw new ValidationError("Informe um número válido no formato internacional.");
        }

        const user = await this.repository.findById(userId);
        if (!user) throw new NotFoundError("Usuário não encontrado.");

        if (user.phone?.number === normalizedPhone && user.phone?.verified) {
            return { alreadyVerified: true, phone: normalizedPhone };
        }

        const phoneOwner = await this.repository.findByPhone(normalizedPhone);
        if (phoneOwner && String(phoneOwner._id) !== String(userId)) {
            throw new ConflictError("Este número de telefone já está sendo utilizado.");
        }

        await sendWhatsAppOtp(normalizedPhone);
        return { phone: normalizedPhone };
    }

    async verifyPhoneNumber(userId, phone, otp) {
        const normalizedPhone = String(phone || "").trim();
        const normalizedOtp = String(otp || "").trim();
        if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
            throw new ValidationError("Número de telefone inválido.");
        }
        if (!/^\d{6}$/.test(normalizedOtp)) {
            throw new ValidationError("Informe o código de verificação de 6 dígitos.");
        }

        const phoneOwner = await this.repository.findByPhone(normalizedPhone);
        if (phoneOwner && String(phoneOwner._id) !== String(userId)) {
            throw new ConflictError("Este número de telefone já está sendo utilizado.");
        }

        const otpEntry = await verifyOtpCode(normalizedPhone, normalizedOtp);
        if (!otpEntry) {
            throw new GeneralError("Código OTP inválido ou expirado.", 400);
        }

        const updated = await this.repository.setVerifiedPhone(userId, normalizedPhone);
        if (!updated) throw new NotFoundError("Usuário não encontrado.");
        return await this.repository.findById(userId, { password: 0 });
    }

    async createPasswordResetToken(email) {
        const user = await this.repository.findByEmail(email);
        if (!user || user.isActive === false) return null;

        const token = randomBytes(32).toString("hex");
        const stored = await this.repository.storePasswordResetToken(
            user._id,
            hashResetToken(token),
            new Date(Date.now() + PASSWORD_RESET_LIFETIME_MS)
        );

        return stored ? token : null;
    }

    async isPasswordResetTokenValid(token) {
        if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
        return this.repository.hasValidPasswordResetToken(hashResetToken(token));
    }

    async resetPassword(token, password) {
        if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;

        const tokenHash = hashResetToken(token);
        if (!await this.repository.hasValidPasswordResetToken(tokenHash)) return false;

        const passwordHash = await createHashPassword(password);
        return this.repository.resetPasswordWithToken(tokenHash, passwordHash);
    }

    async countUsers() {
        return await this.repository.count();
    }

    async getAllUsers(options = { projection: { password: 0 } }) {
        return await this.repository.findAll({}, options);
    }

    /** Usuário sem o hash da senha (seguro para views/sessão). */
    async getUserById(id) {
        return await this.repository.findById(id, { password: 0 });
    }

    async deleteUser(id) {
        const deleted = await this.repository.delete(id);
        if (!deleted) throw new NotFoundError("Usuário não encontrado.");
        return true;
    }

    async updateUser(id, updateData) {
        if (!id) throw new ValidationError("ID do usuário é obrigatório.");
        const existing = await this.repository.findById(id);
        if (!existing) throw new NotFoundError("Usuário não encontrado.");

        await this.repository.updateProfile(id, updateData);
        return await this.repository.findById(id, { password: 0 });
    }

    async changePassword(userId, currentPassword, newPassword, confirmPassword) {
        if (!currentPassword) {
            throw new ValidationError("Preencha a senha atual, a nova senha e a confirmação.");
        }
        assertNewPassword(newPassword, confirmPassword);

        const user = await this.repository.findById(userId);
        if (!user) throw new NotFoundError("Usuário não encontrado.");
        if (!await compararPassword(currentPassword, user.password)) {
            throw new ValidationError("A senha atual está incorreta.");
        }

        const passwordHash = await createHashPassword(newPassword);
        await this.repository.updateProfile(userId, { password: passwordHash });
    }

    // ------------------------------------------------------------------
    // Perfil e administração de usuários
    // ------------------------------------------------------------------

    async updateOwnProfile(userId, { name } = {}) {
        const cleanName = String(name || "").trim();
        if (!cleanName) throw new ValidationError("O nome é obrigatório.");
        return await this.updateUser(userId, { name: cleanName });
    }

    async adminUpdateUser(id, { name, phone, role, isActive } = {}) {
        if (!id || !ObjectId.isValid(id)) {
            throw new ValidationError("ID de usuário inválido.");
        }
        if (!name || !String(name).trim()) {
            throw new ValidationError("O nome é obrigatório.");
        }
        if (role && !ALLOWED_ROLES.includes(role)) {
            throw new ValidationError("Perfil/função inválida.");
        }

        return await this.updateUser(id, {
            name: String(name).trim(),
            phone: typeof phone === "string" ? phone.trim() : "",
            role: role || "user",
            isActive: typeof isActive === "boolean" ? isActive : isActive === "true",
        });
    }

    // ------------------------------------------------------------------
    // Recuperação de senha
    // ------------------------------------------------------------------

    /**
     * Gera o token e dispara o e-mail em segundo plano. Nunca revela se o e-mail existe.
     */
    async requestPasswordReset(email) {
        const normalized = assertEmail(email);
        const token = await this.createPasswordResetToken(normalized);
        if (!token) return;

        void this.#sendResetEmail(normalized, token);
    }

    async #sendResetEmail(email, token) {
        try {
            const appUrl = process.env.APP_URL || (process.env.NODE_ENV === "production"
                ? null
                : `http://localhost:${process.env.PORT || 3090}`);
            if (!appUrl) throw new Error("APP_URL deve estar configurado em produção.");

            const resetUrl = new URL("/reset-password", appUrl);
            resetUrl.searchParams.set("token", token);
            await sendPasswordResetEmail(email, resetUrl.toString());
        } catch (error) {
            console.error("Falha ao enviar e-mail de redefinição de senha:", error);
        }
    }

    async completePasswordReset(token, password, confirmPassword) {
        if (!token) throw new ValidationError("Preencha todos os campos.");
        assertNewPassword(password, confirmPassword);

        const updated = await this.resetPassword(token, password);
        if (!updated) {
            throw new ValidationError("Este link é inválido ou expirou. Solicite uma nova redefinição.");
        }
    }

    // ------------------------------------------------------------------
    // Verificação de e-mail (OTP)
    // ------------------------------------------------------------------

    async sendEmailVerificationCode(sessionUser) {
        const email = normalizeEmail(sessionUser?.email?.endereco);
        if (!email) throw new ValidationError("Sua conta não possui um e-mail válido.");
        await sendEmailOtp(email);
    }

    async verifyEmailCode(sessionUser, requestedEmail, otp) {
        if (!sessionUser?._id) {
            throw new UnauthorizedError("Sessão expirada ou usuário não autenticado.");
        }

        const accountEmail = normalizeEmail(sessionUser.email?.endereco);
        if (!accountEmail || normalizeEmail(requestedEmail) !== accountEmail) {
            throw new ValidationError("O código deve corresponder ao e-mail da sua conta.");
        }

        const otpEntry = await verifyOtpCode(accountEmail, otp);
        if (!otpEntry) throw new GeneralError("Código OTP inválido ou expirado.", 400);

        return await this.verifyAndUpgradeUser(sessionUser._id);
    }
}
