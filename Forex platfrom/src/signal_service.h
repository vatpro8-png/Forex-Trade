#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>

struct AppConfig
{
	unsigned short port = 8080;
	std::string webhookSecret;
	std::string telegramBotToken;
	std::string telegramChatId;
	std::filesystem::path signalFile = "data/signals.tsv";

	static AppConfig fromEnvironment();
};

enum class SignalDirection { Buy, Sell };
enum class SignalStatus { Active, Tp1Hit, Tp2Hit, Tp3Hit, SlHit, Closed, Cancelled };

struct Signal
{
	std::string id;
	std::string pair;
	SignalDirection direction;
	double entryPrice = 0;
	double stopLoss = 0;
	double takeProfit1 = 0;
	double takeProfit2 = 0;
	double takeProfit3 = 0;
	std::string signalTime;
	SignalStatus status = SignalStatus::Active;
};

class SignalService
{
public:
	explicit SignalService(AppConfig config);
	void run();

private:
	AppConfig config_;
	std::vector<Signal> signals_;

	void loadSignals();
	void persistSignals() const;
	std::string handleRequest(const std::string& method, const std::string& target,
							  const std::string& body, int& statusCode);
	std::optional<Signal> parseTradingViewPayload(const std::string& body) const;
	bool publishTelegram(const Signal& signal) const;
	static std::string signalsJson(const std::vector<Signal>& signals);
};

std::string toString(SignalDirection direction);
std::string toString(SignalStatus status);
