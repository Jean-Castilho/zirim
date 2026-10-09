import { createHash, randomBytes } from "node:crypto";
import UserRepository from "../repository/UserRepository.js";
import { ValidationError, GeneralError, NotFoundError } from "../utils/handleResponse.js";
import { compararPassword, createHashPassword } from "./authServices.js";
import { validateUser } from "./validationData.js";
import { sendWhatsAppOtp } from "./contactService.js";
import { verifyOtpCode } from "./otpService.js";

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
        if (emailExists) throw new GeneralError("Este e-mail já está sendo utilizado.", 409);

        const phoneExists = await this.repository.findByPhone(data.phone);
        if (phoneExists) throw new GeneralError("Este número de telefone já está sendo utilizado.", 409);

        data.password = await createHashPassword(data.password);
        return await this.repository.create(data);
    }

    async verifyAndUpgradeUser(userId) {
        const updated = await this.repository.updateProfile(userId, { emailVerified: true });
        if (!updated) throw new Error("Falha ao atualizar status de verificação.");
        return await this.repository.findById(userId);
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
            throw new GeneralError("Este número de telefone já está sendo utilizado.", 409);
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
            throw new GeneralError("Este número de telefone já está sendo utilizado.", 409);
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
        return await this.repository.collection.countDocuments({});
    }

    async getAllUsers(options = { projection: { password: 0 } }) {
        return await this.repository.findAll({}, options);
    }

    async getUserById(id) {
        return await this.repository.findById(id);
    }

    async deleteUser(id) {
        return await this.repository.delete(id);
    }

    async updateUser(id, updateData) {
        if (!id) throw new ValidationError("ID do usuário é obrigatório.");
        const existing = await this.repository.findById(id);
        if (!existing) throw new NotFoundError("Usuário não encontrado.");

        await this.repository.updateProfile(id, updateData);
        return await this.repository.findById(id, { password: 0 });
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.repository.findById(userId);
        if (!user) throw new NotFoundError("Usuário não encontrado.");
        if (!await compararPassword(currentPassword, user.password)) {
            throw new ValidationError("A senha atual está incorreta.");
        }

        const passwordHash = await createHashPassword(newPassword);
        await this.repository.updateProfile(userId, { password: passwordHash });
    }
}