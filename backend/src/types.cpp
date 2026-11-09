#include "database.hpp"
#include <nlohmann/json.hpp>
#include <chrono>
#include <sstream>
#include <iomanip>

using json = nlohmann::json;

namespace sfc::types {

	json Signal::to_json() const {
		json j;
		j["id"] = id;
		j["external_id"] = external_id;
		j["trading_pair"] = trading_pair;
		j["direction"] = static_cast<int>(direction);
		j["entry_price"] = entry_price;
		j["stop_loss"] = stop_loss;
		j["take_profit_1"] = take_profit_1;
		j["take_profit_2"] = take_profit_2;
		j["take_profit_3"] = take_profit_3;
		j["status"] = static_cast<int>(status);
		j["created_by_user_id"] = created_by_user_id;
		j["is_published"] = is_published;

		// Convert time_point to ISO 8601 string
		auto created_time_t = std::chrono::system_clock::to_time_t(created_at);
		auto event_time_t = std::chrono::system_clock::to_time_t(event_time);

		std::ostringstream oss_created;
		oss_created << std::put_time(std::gmtime(&created_time_t), "%Y-%m-%dT%H:%M:%SZ");
		j["created_at"] = oss_created.str();

		std::ostringstream oss_event;
		oss_event << std::put_time(std::gmtime(&event_time_t), "%Y-%m-%dT%H:%M:%SZ");
		j["event_time"] = oss_event.str();

		return j;
	}

	Signal Signal::from_json(const json& j) {
		Signal s;
		s.id = j["id"];
		s.external_id = j["external_id"];
		s.trading_pair = j["trading_pair"];
		s.direction = static_cast<SignalDirection>(j["direction"]);
		s.entry_price = j["entry_price"];
		s.stop_loss = j["stop_loss"];
		s.take_profit_1 = j["take_profit_1"];
		s.take_profit_2 = j.value("take_profit_2", 0.0);
		s.take_profit_3 = j.value("take_profit_3", 0.0);
		s.status = static_cast<SignalStatus>(j["status"]);
		s.created_by_user_id = j["created_by_user_id"];
		s.is_published = j["is_published"];
		// Parse timestamps from ISO 8601
		// (simplified, use boost::posix_time for full parsing)
		return s;
	}

	json User::to_json() const {
		json j;
		j["id"] = id;
		j["email"] = email;
		j["username"] = username;
		j["membership_tier"] = static_cast<int>(membership_tier);
		j["email_verified"] = email_verified;
		j["is_active"] = is_active;

		auto created_time_t = std::chrono::system_clock::to_time_t(created_at);
		std::ostringstream oss;
		oss << std::put_time(std::gmtime(&created_time_t), "%Y-%m-%dT%H:%M:%SZ");
		j["created_at"] = oss.str();

		return j;
	}

	User User::from_json(const json& j) {
		User u;
		u.id = j["id"];
		u.email = j["email"];
		u.username = j["username"];
		u.membership_tier = static_cast<MembershipTier>(j["membership_tier"]);
		u.email_verified = j["email_verified"];
		u.is_active = j["is_active"];
		return u;
	}

	json Subscription::to_json() const {
		json j;
		j["id"] = id;
		j["user_id"] = user_id;
		j["tier"] = static_cast<int>(tier);
		j["is_active"] = is_active;
		j["amount_paid"] = amount_paid;
		j["currency"] = currency;
		return j;
	}

	Subscription Subscription::from_json(const json& j) {
		Subscription s;
		s.id = j["id"];
		s.user_id = j["user_id"];
		s.tier = static_cast<MembershipTier>(j["tier"]);
		s.is_active = j["is_active"];
		s.amount_paid = j["amount_paid"];
		s.currency = j["currency"];
		return s;
	}

	json SignalMilestone::to_json() const {
		json j;
		j["id"] = id;
		j["signal_id"] = signal_id;
		j["status"] = static_cast<int>(status);
		j["milestone_price"] = milestone_price;
		j["notes"] = notes;

		auto time_t = std::chrono::system_clock::to_time_t(occurred_at);
		std::ostringstream oss;
		oss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
		j["occurred_at"] = oss.str();

		return j;
	}

	SignalMilestone SignalMilestone::from_json(const json& j) {
		SignalMilestone m;
		m.id = j["id"];
		m.signal_id = j["signal_id"];
		m.status = static_cast<SignalStatus>(j["status"]);
		m.milestone_price = j["milestone_price"];
		m.notes = j["notes"];
		return m;
	}

	json TelegramDelivery::to_json() const {
		json j;
		j["id"] = id;
		j["signal_id"] = signal_id;
		j["telegram_message_id"] = telegram_message_id;
		j["status"] = static_cast<int>(status);
		j["retry_count"] = retry_count;
		j["error_message"] = error_message;

		auto time_t = std::chrono::system_clock::to_time_t(sent_at);
		std::ostringstream oss;
		oss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
		j["sent_at"] = oss.str();

		return j;
	}

	TelegramDelivery TelegramDelivery::from_json(const json& j) {
		TelegramDelivery t;
		t.id = j["id"];
		t.signal_id = j["signal_id"];
		t.telegram_message_id = j["telegram_message_id"];
		t.status = static_cast<TelegramDeliveryStatus>(j["status"]);
		t.retry_count = j["retry_count"];
		t.error_message = j["error_message"];
		return t;
	}

}  // namespace sfc::types
