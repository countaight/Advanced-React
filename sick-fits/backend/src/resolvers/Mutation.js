const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');

const Mutations = {
	async createItem(parent, args, ctx, info) {
		// TODO: check if they are logged in

		const item = await ctx.db.mutation.createItem({
			data: {
				...args
			}
		}, info);

		return item;
	},
	updateItem(parent, args, ctx, info) {
		// take a copy of the updates
		const updates = { ...args };
		// remove gthe ID from the updates
		delete updates.id;
		// run the update method
		return ctx.db.mutation.updateItem({
			data: updates,
			where: {
				id: args.id
			},
		}, info);
	},
	async deleteItem(parent, args, ctx, info) {
		const where = { id: args.id };
		// 1. Find item
		const item = await ctx.db.query.item({ where }, `{ id title }`);
		// 2. Check if they own the item or have permissions
		// 3. Delete it
		return ctx.db.mutation.deleteItem({ where }, info);
	},
	async signup(parent, args, ctx, info) {
		args.email = args.email.toLowerCase();
		// Hash user's password
		const password = await bcrypt.hash(args.password, 10);
		// Create user
		const user = await ctx.db.mutation.createUser({
			data: {
				...args,
				password,
				permissions: { set: ['USER'] }
			}
		}, info);
		// Create JWT for them
		const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
		// Set token to the cookie in the response
		ctx.response.cookie('token', token, {
			httpOnly: true,
			maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
		});
		// Return user
		return user;
	},
	async signin(parent, { email, password }, ctx, info) {
		// 1. Check if user exists
		const user = await ctx.db.query.user({ where: { email } });
		if (!user) {
			throw new Error(`No such user found for email ${email}`);
		}
		// 2. Check if password is correct
		const valid = await bcrypt.compare(password, user.password);
		if (!valid) {
			throw new Error('Invalid password');
		}
		// 3. Generate JWT
		const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
		// 4. Set cookie to token
		ctx.response.cookie('token', token, {
			httpOnly: true,
			maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
		});
		// 5. Return user
		return user;
	},
	signout(parent, args, ctx, info) {
		ctx.response.clearCookie('token');
		return { message: 'Goodbye!' };
	},
	async requestReset(parent, { email }, ctx, info) {
		// 1. Check if there is a user
		const user = await ctx.db.query.user({ where: { email } });

		if(!user) {
			throw new Error(`No such user found for email ${email}`);
		};
		// 2. Set a reset token and expiry on that user
		const randomBytesPromisified = promisify(randomBytes);
		const resetToken = (await randomBytesPromisified(20)).toString('hex');
		const resetTokenExpiry = Date.now() + 3600000;
		const res = await ctx.db.mutation.updateUser({
			where: { email },
			data: { resetToken, resetTokenExpiry }
		});

		return { message: 'Thanks!' };
		// 3. Email them the reset token
	},
	async resetPassword(parent, { resetToken, password, confirmPassword }, ctx, info) {
		// 1. Check if passwords match
		if(password !== confirmPassword) {
			throw new Error("Yo passwords don't match!");
		}
		// 2. Check reset token legitimacy
		// 3. Check expiration
		const [user] = await ctx.db.query.users({
			where: {
				resetToken,
				resetTokenExpiry_gte: Date.now() - 3600000
			}
		});

		if(!user) {
			throw new Error('This token is either invalid or expired!');
		}
		// 4. Hash new password
		password = await bcrypt.hash(password, 10);
		// 5. Save new password and remove token fields
		const updatedUser = await ctx.db.mutation.updateUser({
			where: { email: user.email },
			data: {
				password,
				resetToken: null,
				resetTokenExpiry: null
			}
		});
		// 6. Generate JWT
		const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
		// 7. Set JWT Cookie
		ctx.response.cookie('token', token, {
			httpOnly: true,
			maxAge: 1000 * 60 * 60 * 24 * 365
		});
		// 8. Return the new User
		return updatedUser;
	}
};

module.exports = Mutations;
