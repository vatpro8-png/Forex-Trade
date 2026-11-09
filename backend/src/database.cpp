#include "database.hpp"
#include <libpq-fe.h>
#include <stdexcept>
#include <sstream>
#include <iostream>

namespace sfc::db {

	class DatabaseConnection {
	public:
		explicit DatabaseConnection(const std::string& connection_string) 
			: connection_string_(connection_string), conn_(nullptr) {}

		~DatabaseConnection() {
			disconnect();
		}

		bool connect() {
			conn_ = PQconnectdb(connection_string_.c_str());
			if (PQstatus(conn_) != CONNECTION_OK) {
				std::string error = PQerrorMessage(conn_);
				PQfinish(conn_);
				conn_ = nullptr;
				throw std::runtime_error("Database connection failed: " + error);
			}
			return true;
		}

		void disconnect() {
			if (conn_) {
				PQfinish(conn_);
				conn_ = nullptr;
			}
		}

		bool is_connected() const {
			return conn_ && PQstatus(conn_) == CONNECTION_OK;
		}

		PGconn* get() { return conn_; }

	private:
		std::string connection_string_;
		PGconn* conn_;
	};

	// Database implementation
	Database::Database(const std::string& connection_string)
		: connection_string_(connection_string) {
		connection_ = std::make_unique<DatabaseConnection>(connection_string);
	}

	Database::~Database() = default;

	bool Database::connect() {
		try {
			return connection_->connect();
		} catch (const std::exception& e) {
			std::cerr << "Database connection error: " << e.what() << std::endl;
			return false;
		}
	}

	void Database::disconnect() {
		connection_->disconnect();
	}

	bool Database::is_connected() const {
		return connection_->is_connected();
	}

	// User operations
	int64_t Database::create_user(const sfc::types::User& user) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		const char* params[] = {
			user.email.c_str(),
			user.username.c_str(),
			user.password_hash.c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(),
			"INSERT INTO users (email, username, password_hash, membership_tier) "
			"VALUES ($1, $2, $3, 0) RETURNING id",
			3, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			std::string error = PQerrorMessage(connection_->get());
			PQclear(res);
			throw std::runtime_error("Insert user failed: " + error);
		}

		int64_t user_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return user_id;
	}

	std::shared_ptr<sfc::types::User> Database::get_user_by_id(int64_t user_id) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string query = "SELECT id, email, username, membership_tier, "
						   "email_verified, is_active, created_at FROM users WHERE id = $1";
		std::string id_str = std::to_string(user_id);
		const char* params[] = { id_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(), query.c_str(), 1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return nullptr;
		}

		if (PQntuples(res) == 0) {
			PQclear(res);
			return nullptr;
		}

		auto user = std::make_shared<sfc::types::User>();
		user->id = std::stoll(PQgetvalue(res, 0, 0));
		user->email = PQgetvalue(res, 0, 1);
		user->username = PQgetvalue(res, 0, 2);
		user->membership_tier = static_cast<sfc::types::MembershipTier>(
			std::stoi(PQgetvalue(res, 0, 3))
		);
		user->email_verified = strcmp(PQgetvalue(res, 0, 4), "t") == 0;
		user->is_active = strcmp(PQgetvalue(res, 0, 5), "t") == 0;

		PQclear(res);
		return user;
	}

	std::shared_ptr<sfc::types::User> Database::get_user_by_email(const std::string& email) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		const char* params[] = { email.c_str() };
		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id, email, username, membership_tier, email_verified, is_active, created_at "
			"FROM users WHERE LOWER(email) = LOWER($1)",
			1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
			PQclear(res);
			return nullptr;
		}

		auto user = std::make_shared<sfc::types::User>();
		user->id = std::stoll(PQgetvalue(res, 0, 0));
		user->email = PQgetvalue(res, 0, 1);
		user->username = PQgetvalue(res, 0, 2);
		user->membership_tier = static_cast<sfc::types::MembershipTier>(
			std::stoi(PQgetvalue(res, 0, 3))
		);
		user->email_verified = strcmp(PQgetvalue(res, 0, 4), "t") == 0;
		user->is_active = strcmp(PQgetvalue(res, 0, 5), "t") == 0;

		PQclear(res);
		return user;
	}

	bool Database::update_user(const sfc::types::User& user) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		const char* params[] = {
			std::to_string(user.membership_tier).c_str(),
			(user.email_verified ? "true" : "false"),
			(user.is_active ? "true" : "false"),
			std::to_string(user.id).c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(),
			"UPDATE users SET membership_tier = $1, email_verified = $2, is_active = $3 WHERE id = $4",
			4, nullptr, params, nullptr, nullptr, 0
		);

		bool success = (PQresultStatus(res) == PGRES_COMMAND_OK);
		PQclear(res);
		return success;
	}

	bool Database::user_exists(const std::string& email) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		const char* params[] = { email.c_str() };
		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)",
			1, nullptr, params, nullptr, nullptr, 0
		);

		bool exists = (PQntuples(res) > 0);
		PQclear(res);
		return exists;
	}

	// Signal operations
	int64_t Database::create_signal(const sfc::types::Signal& signal) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string sql = "INSERT INTO signals "
			"(external_id, trading_pair, direction, entry_price, stop_loss, "
			"take_profit_1, take_profit_2, take_profit_3, status, created_by_user_id, "
			"is_published, event_time) "
			"VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) "
			"RETURNING id";

		const char* params[] = {
			signal.external_id.c_str(),
			signal.trading_pair.c_str(),
			std::to_string(static_cast<int>(signal.direction)).c_str(),
			std::to_string(signal.entry_price).c_str(),
			std::to_string(signal.stop_loss).c_str(),
			std::to_string(signal.take_profit_1).c_str(),
			std::to_string(signal.take_profit_2).c_str(),
			std::to_string(signal.take_profit_3).c_str(),
			std::to_string(static_cast<int>(signal.status)).c_str(),
			std::to_string(signal.created_by_user_id).c_str(),
			(signal.is_published ? "true" : "false"),
			"NOW()"  // Use database current timestamp
		};

		PGresult* res = PQexecParams(
			connection_->get(), sql.c_str(), 12, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			throw std::runtime_error("Insert signal failed");
		}

		int64_t signal_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return signal_id;
	}

	std::shared_ptr<sfc::types::Signal> Database::get_signal_by_id(int64_t signal_id) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string query = "SELECT id, external_id, trading_pair, direction, entry_price, "
						   "stop_loss, take_profit_1, take_profit_2, take_profit_3, status, "
						   "created_by_user_id, is_published, created_at, event_time "
						   "FROM signals WHERE id = $1";
		std::string id_str = std::to_string(signal_id);
		const char* params[] = { id_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(), query.c_str(), 1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
			PQclear(res);
			return nullptr;
		}

		auto signal = std::make_shared<sfc::types::Signal>();
		signal->id = std::stoll(PQgetvalue(res, 0, 0));
		signal->external_id = PQgetvalue(res, 0, 1);
		signal->trading_pair = PQgetvalue(res, 0, 2);
		signal->direction = static_cast<sfc::types::SignalDirection>(
			std::stoi(PQgetvalue(res, 0, 3))
		);
		signal->entry_price = std::stod(PQgetvalue(res, 0, 4));
		signal->stop_loss = std::stod(PQgetvalue(res, 0, 5));
		signal->take_profit_1 = std::stod(PQgetvalue(res, 0, 6));
		signal->take_profit_2 = std::stod(PQgetvalue(res, 0, 7));
		signal->take_profit_3 = std::stod(PQgetvalue(res, 0, 8));
		signal->status = static_cast<sfc::types::SignalStatus>(
			std::stoi(PQgetvalue(res, 0, 9))
		);
		signal->created_by_user_id = std::stoll(PQgetvalue(res, 0, 10));
		signal->is_published = strcmp(PQgetvalue(res, 0, 11), "t") == 0;

		PQclear(res);
		return signal;
	}

	std::shared_ptr<sfc::types::Signal> Database::get_signal_by_external_id(const std::string& external_id) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		const char* params[] = { external_id.c_str() };
		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id FROM signals WHERE external_id = $1 LIMIT 1",
			1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
			PQclear(res);
			return nullptr;
		}

		int64_t signal_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return get_signal_by_id(signal_id);
	}

	std::vector<std::shared_ptr<sfc::types::Signal>> Database::get_signals_by_pair(
		const std::string& pair, int limit) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::vector<std::shared_ptr<sfc::types::Signal>> signals;

		const char* params[] = { pair.c_str(), std::to_string(limit).c_str() };
		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id FROM signals WHERE trading_pair = $1 ORDER BY created_at DESC LIMIT $2",
			2, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return signals;
		}

		int n_tuples = PQntuples(res);
		for (int i = 0; i < n_tuples; ++i) {
			int64_t signal_id = std::stoll(PQgetvalue(res, i, 0));
			if (auto sig = get_signal_by_id(signal_id)) {
				signals.push_back(sig);
			}
		}

		PQclear(res);
		return signals;
	}

	std::vector<std::shared_ptr<sfc::types::Signal>> Database::get_active_signals() {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::vector<std::shared_ptr<sfc::types::Signal>> signals;

		PGresult* res = PQexec(
			connection_->get(),
			"SELECT id FROM signals WHERE status = 0 ORDER BY created_at DESC"
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return signals;
		}

		int n_tuples = PQntuples(res);
		for (int i = 0; i < n_tuples; ++i) {
			int64_t signal_id = std::stoll(PQgetvalue(res, i, 0));
			if (auto sig = get_signal_by_id(signal_id)) {
				signals.push_back(sig);
			}
		}

		PQclear(res);
		return signals;
	}

	bool Database::update_signal_status(int64_t signal_id, sfc::types::SignalStatus status) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string id_str = std::to_string(signal_id);
		std::string status_str = std::to_string(static_cast<int>(status));
		const char* params[] = { status_str.c_str(), id_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(),
			"UPDATE signals SET status = $1, updated_at = NOW() WHERE id = $2",
			2, nullptr, params, nullptr, nullptr, 0
		);

		bool success = (PQresultStatus(res) == PGRES_COMMAND_OK);
		PQclear(res);
		return success;
	}

	// Milestone operations
	int64_t Database::create_milestone(const sfc::types::SignalMilestone& milestone) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string sql = "INSERT INTO signal_milestones "
			"(signal_id, status, milestone_price, notes) "
			"VALUES ($1, $2, $3, $4) "
			"RETURNING id";

		const char* params[] = {
			std::to_string(milestone.signal_id).c_str(),
			std::to_string(static_cast<int>(milestone.status)).c_str(),
			std::to_string(milestone.milestone_price).c_str(),
			milestone.notes.c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(), sql.c_str(), 4, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return -1;
		}

		int64_t milestone_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return milestone_id;
	}

	std::vector<std::shared_ptr<sfc::types::SignalMilestone>> Database::get_milestones_for_signal(
		int64_t signal_id) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::vector<std::shared_ptr<sfc::types::SignalMilestone>> milestones;

		std::string id_str = std::to_string(signal_id);
		const char* params[] = { id_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id, signal_id, status, milestone_price, occurred_at, notes "
			"FROM signal_milestones WHERE signal_id = $1 ORDER BY occurred_at ASC",
			1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return milestones;
		}

		int n_tuples = PQntuples(res);
		for (int i = 0; i < n_tuples; ++i) {
			auto m = std::make_shared<sfc::types::SignalMilestone>();
			m->id = std::stoll(PQgetvalue(res, i, 0));
			m->signal_id = std::stoll(PQgetvalue(res, i, 1));
			m->status = static_cast<sfc::types::SignalStatus>(
				std::stoi(PQgetvalue(res, i, 2))
			);
			m->milestone_price = std::stod(PQgetvalue(res, i, 3));
			m->notes = PQgetvalue(res, i, 5);
			milestones.push_back(m);
		}

		PQclear(res);
		return milestones;
	}

	bool Database::milestone_already_exists(int64_t signal_id, sfc::types::SignalStatus status) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string id_str = std::to_string(signal_id);
		std::string status_str = std::to_string(static_cast<int>(status));
		const char* params[] = { id_str.c_str(), status_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT 1 FROM signal_milestones WHERE signal_id = $1 AND status = $2 LIMIT 1",
			2, nullptr, params, nullptr, nullptr, 0
		);

		bool exists = (PQntuples(res) > 0);
		PQclear(res);
		return exists;
	}

	// Subscription operations
	int64_t Database::create_subscription(const sfc::types::Subscription& subscription) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string sql = "INSERT INTO subscriptions "
			"(user_id, tier, is_active) "
			"VALUES ($1, $2, $3) "
			"RETURNING id";

		const char* params[] = {
			std::to_string(subscription.user_id).c_str(),
			std::to_string(static_cast<int>(subscription.tier)).c_str(),
			(subscription.is_active ? "true" : "false")
		};

		PGresult* res = PQexecParams(
			connection_->get(), sql.c_str(), 3, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return -1;
		}

		int64_t sub_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return sub_id;
	}

	std::shared_ptr<sfc::types::Subscription> Database::get_subscription_by_user_id(int64_t user_id) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string id_str = std::to_string(user_id);
		const char* params[] = { id_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id, user_id, tier, is_active FROM subscriptions WHERE user_id = $1",
			1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
			PQclear(res);
			return nullptr;
		}

		auto sub = std::make_shared<sfc::types::Subscription>();
		sub->id = std::stoll(PQgetvalue(res, 0, 0));
		sub->user_id = std::stoll(PQgetvalue(res, 0, 1));
		sub->tier = static_cast<sfc::types::MembershipTier>(
			std::stoi(PQgetvalue(res, 0, 2))
		);
		sub->is_active = strcmp(PQgetvalue(res, 0, 3), "t") == 0;

		PQclear(res);
		return sub;
	}

	bool Database::update_subscription(const sfc::types::Subscription& subscription) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string id_str = std::to_string(subscription.id);
		std::string tier_str = std::to_string(static_cast<int>(subscription.tier));
		const char* params[] = {
			tier_str.c_str(),
			(subscription.is_active ? "true" : "false"),
			id_str.c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(),
			"UPDATE subscriptions SET tier = $1, is_active = $2, updated_at = NOW() WHERE id = $3",
			3, nullptr, params, nullptr, nullptr, 0
		);

		bool success = (PQresultStatus(res) == PGRES_COMMAND_OK);
		PQclear(res);
		return success;
	}

	std::vector<std::shared_ptr<sfc::types::Subscription>> Database::get_expiring_subscriptions(int days) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::vector<std::shared_ptr<sfc::types::Subscription>> subs;

		std::string days_str = std::to_string(days);
		const char* params[] = { days_str.c_str() };

		PGresult* res = PQexecParams(
			connection_->get(),
			"SELECT id, user_id, tier, is_active FROM subscriptions "
			"WHERE is_active = true AND renews_at < NOW() + interval '1 day' * $1",
			1, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return subs;
		}

		int n_tuples = PQntuples(res);
		for (int i = 0; i < n_tuples; ++i) {
			auto sub = std::make_shared<sfc::types::Subscription>();
			sub->id = std::stoll(PQgetvalue(res, i, 0));
			sub->user_id = std::stoll(PQgetvalue(res, i, 1));
			sub->tier = static_cast<sfc::types::MembershipTier>(
				std::stoi(PQgetvalue(res, i, 2))
			);
			sub->is_active = strcmp(PQgetvalue(res, i, 3), "t") == 0;
			subs.push_back(sub);
		}

		PQclear(res);
		return subs;
	}

	// Telegram Delivery operations
	int64_t Database::create_telegram_delivery(const sfc::types::TelegramDelivery& delivery) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string sql = "INSERT INTO telegram_deliveries "
			"(signal_id, status, retry_count) "
			"VALUES ($1, $2, $3) "
			"RETURNING id";

		const char* params[] = {
			std::to_string(delivery.signal_id).c_str(),
			std::to_string(static_cast<int>(delivery.status)).c_str(),
			std::to_string(delivery.retry_count).c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(), sql.c_str(), 3, nullptr, params, nullptr, nullptr, 0
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return -1;
		}

		int64_t delivery_id = std::stoll(PQgetvalue(res, 0, 0));
		PQclear(res);
		return delivery_id;
	}

	bool Database::update_telegram_delivery_status(int64_t delivery_id, 
												   sfc::types::TelegramDeliveryStatus status,
												   const std::string& error_msg) {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::string id_str = std::to_string(delivery_id);
		std::string status_str = std::to_string(static_cast<int>(status));
		const char* params[] = {
			status_str.c_str(),
			error_msg.c_str(),
			id_str.c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(),
			"UPDATE telegram_deliveries SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
			3, nullptr, params, nullptr, nullptr, 0
		);

		bool success = (PQresultStatus(res) == PGRES_COMMAND_OK);
		PQclear(res);
		return success;
	}

	std::vector<std::shared_ptr<sfc::types::TelegramDelivery>> Database::get_failed_deliveries() {
		if (!is_connected()) throw std::runtime_error("Database not connected");

		std::vector<std::shared_ptr<sfc::types::TelegramDelivery>> deliveries;

		PGresult* res = PQexec(
			connection_->get(),
			"SELECT id, signal_id, status, error_message FROM telegram_deliveries "
			"WHERE status = 2 OR status = 3 ORDER BY created_at ASC LIMIT 100"
		);

		if (PQresultStatus(res) != PGRES_TUPLES_OK) {
			PQclear(res);
			return deliveries;
		}

		int n_tuples = PQntuples(res);
		for (int i = 0; i < n_tuples; ++i) {
			auto d = std::make_shared<sfc::types::TelegramDelivery>();
			d->id = std::stoll(PQgetvalue(res, i, 0));
			d->signal_id = std::stoll(PQgetvalue(res, i, 1));
			d->status = static_cast<sfc::types::TelegramDeliveryStatus>(
				std::stoi(PQgetvalue(res, i, 2))
			);
			d->error_message = PQgetvalue(res, i, 3);
			deliveries.push_back(d);
		}

		PQclear(res);
		return deliveries;
	}

	// Audit logging
	void Database::log_audit(int64_t user_id, const std::string& action, const std::string& entity_type, 
							int64_t entity_id, const std::string& details) {
		if (!is_connected()) {
			std::cerr << "Cannot log audit: database not connected" << std::endl;
			return;
		}

		std::string user_id_str = std::to_string(user_id);
		std::string entity_id_str = std::to_string(entity_id);
		const char* params[] = {
			(user_id > 0) ? user_id_str.c_str() : nullptr,
			action.c_str(),
			entity_type.c_str(),
			(entity_id > 0) ? entity_id_str.c_str() : nullptr,
			details.c_str()
		};

		PGresult* res = PQexecParams(
			connection_->get(),
			"INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) "
			"VALUES ($1, $2, $3, $4, $5::jsonb)",
			5, nullptr, params, nullptr, nullptr, 0
		);

		PQclear(res);
	}

}  // namespace sfc::db
