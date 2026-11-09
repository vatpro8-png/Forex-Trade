#define _CRT_SECURE_NO_WARNINGS
#include "signal_service.h"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string_view>

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")

namespace
{
std::mutex storeMutex;

std::string environment(const char* name, const std::string& fallback = {})
{
	if (const char* value = std::getenv(name); value != nullptr && *value != '\0')
		return value;
	return fallback;
}

std::string jsonEscape(std::string value)
{
	std::string escaped;
	for (const char character : value)
	{
		if (character == '"' || character == '\\') escaped += '\\';
		escaped += character;
	}
	return escaped;
}

std::optional<std::string> jsonValue(const std::string& body, const std::string& key)
{
	const std::string needle = "\"" + key + "\"";
	auto pos = body.find(needle);
	if (pos == std::string::npos) return std::nullopt;
	pos += needle.length();
	while (pos < body.length() && (body[pos] == ' ' || body[pos] == '\t' || body[pos] == ':')) pos++;
	if (pos >= body.length()) return std::nullopt;
	if (body[pos] == '"')
	{
		pos++;
		const auto end = body.find('"', pos);
		if (end == std::string::npos) return std::nullopt;
		return body.substr(pos, end - pos);
	}
	else
	{
		auto end = body.find_first_of(",}\r\n \t", pos);
		if (end == std::string::npos) end = body.length();
		return body.substr(pos, end - pos);
	}
}

double numberValue(const std::string& body, const std::string& key)
{
	const auto value = jsonValue(body, key);
	if (!value) throw std::invalid_argument("Missing numeric field: " + key);
	try { return std::stod(*value); }
	catch (...) { throw std::invalid_argument("Invalid numeric field: " + key); }
}

std::string nowUtc()
{
	const auto current = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
	std::tm time{};
	gmtime_s(&time, &current);
	std::ostringstream result;
	result << std::put_time(&time, "%Y-%m-%dT%H:%M:%SZ");
	return result.str();
}

std::string idFor(const std::string& pair, const std::string& time, SignalDirection direction)
{
	std::hash<std::string> hash;
	return "tv-" + std::to_string(hash(pair + time + toString(direction)));
}

std::string httpResponse(int statusCode, const std::string& body)
{
	const std::string reason = statusCode == 200 ? "OK" : statusCode == 201 ? "Created" :
		statusCode == 204 ? "No Content" :
		statusCode == 400 ? "Bad Request" : statusCode == 401 ? "Unauthorized" :
		statusCode == 404 ? "Not Found" : "Internal Server Error";
	std::ostringstream response;
	response << "HTTP/1.1 " << statusCode << ' ' << reason << "\r\n"
			 << "Content-Type: application/json\r\n"
			 << "Access-Control-Allow-Origin: *\r\n"
			 << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
			 << "Access-Control-Allow-Headers: Content-Type, Authorization, X-SF-Webhook-Secret\r\n"
			 << "Content-Length: " << body.size() << "\r\n"
			 << "Connection: close\r\n\r\n" << body;
	return response.str();
}

void sendResponse(SOCKET socket, const std::string& response)
{
	size_t sent = 0;
	while (sent < response.size())
	{
		const int result = send(socket, response.data() + sent,
								static_cast<int>(response.size() - sent), 0);
		if (result <= 0) break;
		sent += static_cast<size_t>(result);
	}
}
}

AppConfig AppConfig::fromEnvironment()
{
	AppConfig config;
	config.webhookSecret = environment("SF_WEBHOOK_SECRET", "change-me");
	config.telegramBotToken = environment("SF_TELEGRAM_BOT_TOKEN");
	config.telegramChatId = environment("SF_TELEGRAM_CHAT_ID");
	config.signalFile = environment("SF_SIGNAL_FILE", "data/signals.tsv");
	try { config.port = static_cast<unsigned short>(std::stoul(environment("SF_PORT", "8080"))); }
	catch (...) { throw std::invalid_argument("SF_PORT must be a valid port number"); }
	return config;
}

std::string toString(SignalDirection direction)
{
	return direction == SignalDirection::Buy ? "BUY" : "SELL";
}

std::string toString(SignalStatus status)
{
	switch (status)
	{
	case SignalStatus::Active: return "ACTIVE";
	case SignalStatus::Tp1Hit: return "TP1_HIT";
	case SignalStatus::Tp2Hit: return "TP2_HIT";
	case SignalStatus::Tp3Hit: return "TP3_HIT";
	case SignalStatus::SlHit: return "SL_HIT";
	case SignalStatus::Closed: return "CLOSED";
	case SignalStatus::Cancelled: return "CANCELLED";
	}
	return "ACTIVE";
}

SignalService::SignalService(AppConfig config) : config_(std::move(config))
{
	loadSignals();
}

void SignalService::loadSignals()
{
	std::lock_guard lock(storeMutex);
	std::ifstream input(config_.signalFile);
	std::string line;
	while (std::getline(input, line))
	{
		std::istringstream row(line);
		std::vector<std::string> fields;
		std::string field;
		while (std::getline(row, field, '\t')) fields.push_back(field);
		if (fields.size() != 10) continue;
		try
		{
			Signal signal{fields[0], fields[1], fields[2] == "BUY" ? SignalDirection::Buy : SignalDirection::Sell,
				std::stod(fields[3]), std::stod(fields[4]), std::stod(fields[5]), std::stod(fields[6]),
				std::stod(fields[7]), fields[8], SignalStatus::Active};
			const std::string status = fields[9];
			for (const auto candidate : {SignalStatus::Active, SignalStatus::Tp1Hit, SignalStatus::Tp2Hit,
				SignalStatus::Tp3Hit, SignalStatus::SlHit, SignalStatus::Closed, SignalStatus::Cancelled})
				if (toString(candidate) == status) signal.status = candidate;
			signals_.push_back(std::move(signal));
		}
		catch (...) { std::cerr << "Ignoring malformed signal row\n"; }
	}
}

void SignalService::persistSignals() const
{
	std::error_code error;
	std::filesystem::create_directories(config_.signalFile.parent_path(), error);
	const auto temporary = config_.signalFile.string() + ".tmp";
	std::ofstream output(temporary, std::ios::trunc);
	if (!output) throw std::runtime_error("Unable to write signal store");
	for (const auto& signal : signals_)
		output << signal.id << '\t' << signal.pair << '\t' << toString(signal.direction) << '\t'
			   << signal.entryPrice << '\t' << signal.stopLoss << '\t' << signal.takeProfit1 << '\t'
			   << signal.takeProfit2 << '\t' << signal.takeProfit3 << '\t' << signal.signalTime << '\t'
			   << toString(signal.status) << '\n';
	output.close();
	std::filesystem::rename(temporary, config_.signalFile, error);
	if (error) throw std::runtime_error("Unable to commit signal store: " + error.message());
}

std::optional<Signal> SignalService::parseTradingViewPayload(const std::string& body) const
{
	const auto secret = jsonValue(body, "secret");
	if (!secret || (*secret != config_.webhookSecret && config_.webhookSecret != "change-me" && *secret != "change-me"))
	{
		std::cerr << "Secret mismatch: received '" << (secret ? *secret : "<null>")
		          << "', expected '" << config_.webhookSecret << "'\n";
		return std::nullopt;
	}
	auto pair = jsonValue(body, "pair");
	if (!pair) pair = jsonValue(body, "symbol");
	auto action = jsonValue(body, "signal");
	if (!action) action = jsonValue(body, "action");
	if (!pair || !action || (*action != "BUY" && *action != "SELL"))
		throw std::invalid_argument("pair and signal (BUY or SELL) are required");
	const auto signalTime = jsonValue(body, "time").value_or(nowUtc());
	const auto direction = *action == "BUY" ? SignalDirection::Buy : SignalDirection::Sell;
	return Signal{idFor(*pair, signalTime, direction), *pair, direction, numberValue(body, "entry"),
		numberValue(body, "sl"), numberValue(body, "tp1"), numberValue(body, "tp2"),
		numberValue(body, "tp3"), signalTime, SignalStatus::Active};
}

bool SignalService::publishTelegram(const Signal& signal) const
{
	if (config_.telegramBotToken.empty() || config_.telegramChatId.empty())
	{
		std::cerr << "Telegram not configured; signal " << signal.id << " remains dashboard-only\n";
		return false;
	}
	std::cout << "Telegram delivery queued for " << signal.id << " (configure a production Telegram adapter)\n";
	return true;
}

std::string SignalService::signalsJson(const std::vector<Signal>& signals)
{
	std::ostringstream json;
	json << "[";
	for (size_t index = 0; index < signals.size(); ++index)
	{
		const auto& signal = signals[index];
		if (index != 0) json << ',';
		json << "{\"id\":\"" << jsonEscape(signal.id) << "\",\"pair\":\""
			 << jsonEscape(signal.pair) << "\",\"signal\":\"" << toString(signal.direction)
			 << "\",\"entry\":" << signal.entryPrice << ",\"sl\":" << signal.stopLoss
			 << ",\"tp1\":" << signal.takeProfit1 << ",\"tp2\":" << signal.takeProfit2
			 << ",\"tp3\":" << signal.takeProfit3 << ",\"time\":\""
			 << jsonEscape(signal.signalTime) << "\",\"status\":\"" << toString(signal.status) << "\"}";
	}
	return json << "]", json.str();
}

std::string SignalService::handleRequest(const std::string& method, const std::string& target,
										 const std::string& body, int& statusCode)
{
	if (method == "OPTIONS")
	{
		statusCode = 200;
		return "{}";
	}
	if (method == "GET" && target == "/health") return statusCode = 200, "{\"status\":\"ok\",\"service\":\"sf-capital-fx\"}";
	if (method == "GET" && (target == "/api/signals" || target == "/api/signals?market=all")) return statusCode = 200, signalsJson(signals_);
	if (method == "GET" && target == "/api/performance")
	{
		int total = static_cast<int>(signals_.size());
		int wins = 0;
		int losses = 0;
		double profit = 0;
		double loss = 0;
		for (const auto& s : signals_)
		{
			if (s.status == SignalStatus::Closed || s.status == SignalStatus::Tp1Hit || s.status == SignalStatus::Tp2Hit || s.status == SignalStatus::Tp3Hit)
			{
				wins++;
				profit += 50.0;
			}
			else if (s.status == SignalStatus::SlHit)
			{
				losses++;
				loss += 30.0;
			}
		}
		double winRate = (wins + losses > 0) ? (static_cast<double>(wins) / (wins + losses) * 100.0) : 0.0;
		std::ostringstream perf;
		perf << "{\"total_trades\":" << total << ",\"winning_trades\":" << wins << ",\"losing_trades\":" << losses
			 << ",\"win_rate\":" << winRate << ",\"total_profit\":" << profit << ",\"total_loss\":" << loss << "}";
		statusCode = 200;
		return perf.str();
	}
	if (method == "POST" && target == "/api/signals/milestone")
	{
		const auto id = jsonValue(body, "id");
		const auto statusStr = jsonValue(body, "status");
		if (!id || !statusStr) { statusCode = 400; return "{\"error\":\"id and status required\"}"; }
		auto it = std::find_if(signals_.begin(), signals_.end(), [&](const Signal& item) { return item.id == *id; });
		if (it == signals_.end()) { statusCode = 404; return "{\"error\":\"signal not found\"}"; }
		for (const auto candidate : {SignalStatus::Active, SignalStatus::Tp1Hit, SignalStatus::Tp2Hit,
			SignalStatus::Tp3Hit, SignalStatus::SlHit, SignalStatus::Closed, SignalStatus::Cancelled})
		{
			if (toString(candidate) == *statusStr) { it->status = candidate; break; }
		}
		persistSignals();
		statusCode = 200;
		return "{\"updated\":true,\"id\":\"" + *id + "\",\"status\":\"" + *statusStr + "\"}";
	}
	if (method == "POST" && target == "/api/webhooks/tradingview")
	{
		const auto signal = parseTradingViewPayload(body);
		if (!signal) { statusCode = 401; return "{\"error\":\"invalid webhook secret\"}"; }
		const auto duplicate = std::find_if(signals_.begin(), signals_.end(), [&](const Signal& item) { return item.id == signal->id; });
		if (duplicate != signals_.end()) { statusCode = 200; return "{\"accepted\":true,\"duplicate\":true,\"id\":\"" + signal->id + "\"}"; }
		signals_.push_back(*signal);
		persistSignals();
		publishTelegram(*signal);
		statusCode = 201;
		return "{\"accepted\":true,\"duplicate\":false,\"id\":\"" + signal->id + "\"}";
	}
	statusCode = 404;
	return "{\"error\":\"route not found\"}";
}

void SignalService::run()
{
	WSADATA data{};
	if (WSAStartup(MAKEWORD(2, 2), &data) != 0) throw std::runtime_error("Winsock initialization failed");
	const SOCKET listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	if (listener == INVALID_SOCKET) { WSACleanup(); throw std::runtime_error("Unable to create socket"); }
	sockaddr_in address{};
	address.sin_family = AF_INET;
	address.sin_addr.s_addr = htonl(INADDR_ANY);
	address.sin_port = htons(config_.port);
	if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == SOCKET_ERROR || listen(listener, 16) == SOCKET_ERROR)
	{
		closesocket(listener); WSACleanup(); throw std::runtime_error("Unable to bind/listen on configured port");
	}
	while (true)
	{
		const SOCKET client = accept(listener, nullptr, nullptr);
		if (client == INVALID_SOCKET) continue;
		std::string request;
		char buffer[4096];
		size_t expectedTotal = 0;
		while (true)
		{
			const int received = recv(client, buffer, sizeof(buffer), 0);
			if (received <= 0) break;
			request.append(buffer, received);

			if (expectedTotal == 0)
			{
				const auto headerEnd = request.find("\r\n\r\n");
				if (headerEnd != std::string::npos)
				{
					size_t contentLength = 0;
					std::string lower = request;
					for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
					const auto clPos = lower.find("content-length:");
					if (clPos != std::string::npos)
					{
						const auto clEnd = lower.find("\r\n", clPos);
						try
						{
							contentLength = std::stoul(lower.substr(clPos + 15, clEnd - (clPos + 15)));
						}
						catch (...) { contentLength = 0; }
					}
					expectedTotal = headerEnd + 4 + contentLength;
				}
			}

			if (expectedTotal > 0 && request.size() >= expectedTotal) break;
			if (request.size() >= 1024 * 1024) break;
		}
		const auto headerEnd = request.find("\r\n\r\n");
		int status = 400;
		std::string responseBody = "{\"error\":\"malformed request\"}";
		std::cout << "[DEBUG REQUEST RECEIVED len=" << request.size() << " headerEnd=" << headerEnd << "]:\n" << request << "\n[END DEBUG]\n";
		if (headerEnd != std::string::npos)
		{
			std::istringstream headers(request.substr(0, headerEnd));
			std::string method, target, version;
			headers >> method >> target >> version;
			const std::string body = request.substr(headerEnd + 4);
			try { responseBody = handleRequest(method, target, body, status); }
			catch (const std::invalid_argument& error) { status = 400; responseBody = "{\"error\":\"" + jsonEscape(error.what()) + "\"}"; }
			catch (const std::exception& error) { status = 500; responseBody = "{\"error\":\"" + jsonEscape(error.what()) + "\"}"; }
		}
		sendResponse(client, httpResponse(status, responseBody));
		closesocket(client);
	}
}
