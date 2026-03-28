package service

import (
	"fmt"
	"sync"
	"time"

	"ai-localbase/internal/model"
)

const (
	recommendedFailureThreshold    = 2
	recommendedCooldownSeconds     = 30
	recommendedHalfOpenMaxRequests = 1
)

func normalizeFailoverPolicy(policy model.FailoverPolicy) model.FailoverPolicy {
	if policy.FailureThreshold <= 0 {
		policy.FailureThreshold = recommendedFailureThreshold
	}
	if policy.CooldownSeconds <= 0 {
		policy.CooldownSeconds = recommendedCooldownSeconds
	}
	if policy.HalfOpenMaxRequests <= 0 {
		policy.HalfOpenMaxRequests = recommendedHalfOpenMaxRequests
	}
	return policy
}

type endpointCircuitPermit struct {
	breaker  *endpointCircuitBreaker
	key      string
	halfOpen bool
}

func (p endpointCircuitPermit) Success() {
	if p.breaker == nil || p.key == "" {
		return
	}
	p.breaker.reportSuccess(p.key, p.halfOpen)
}

func (p endpointCircuitPermit) Failure(err error, policy model.FailoverPolicy) {
	if p.breaker == nil || p.key == "" {
		return
	}
	p.breaker.reportFailure(p.key, p.halfOpen, policy, err)
}

type endpointCircuitState struct {
	State               string
	ConsecutiveFailures int
	OpenUntil           time.Time
	HalfOpenInFlight    int
	LastError           string
	LastFailureAt       time.Time
	LastSuccessAt       time.Time
}

type endpointCircuitBreaker struct {
	mu     sync.Mutex
	states map[string]*endpointCircuitState
	now    func() time.Time
}

func newEndpointCircuitBreaker() *endpointCircuitBreaker {
	return &endpointCircuitBreaker{
		states: map[string]*endpointCircuitState{},
		now:    time.Now,
	}
}

var defaultEndpointCircuitBreaker = newEndpointCircuitBreaker()

func resetDefaultEndpointCircuitBreaker() {
	defaultEndpointCircuitBreaker.reset()
}

func (b *endpointCircuitBreaker) reset() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.states = map[string]*endpointCircuitState{}
}

func (b *endpointCircuitBreaker) allow(scope, label string, policy model.FailoverPolicy) (endpointCircuitPermit, bool, string) {
	if b == nil {
		return endpointCircuitPermit{}, true, ""
	}
	policy = normalizeFailoverPolicy(policy)
	key := fmt.Sprintf("%s::%s", scope, label)
	if key == "::" {
		return endpointCircuitPermit{}, true, ""
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	state, ok := b.states[key]
	if !ok || state == nil {
		state = &endpointCircuitState{State: "closed"}
		b.states[key] = state
	}

	now := b.now().UTC()
	if state.State == "open" {
		if state.OpenUntil.After(now) {
			remaining := int(state.OpenUntil.Sub(now).Seconds())
			if remaining < 1 {
				remaining = 1
			}
			return endpointCircuitPermit{}, false, fmt.Sprintf("circuit open, retry after %ds", remaining)
		}
		state.State = "half-open"
		state.HalfOpenInFlight = 0
	}

	if state.State == "half-open" {
		if state.HalfOpenInFlight >= policy.HalfOpenMaxRequests {
			return endpointCircuitPermit{}, false, "circuit half-open, probing in progress"
		}
		state.HalfOpenInFlight++
		return endpointCircuitPermit{breaker: b, key: key, halfOpen: true}, true, ""
	}

	return endpointCircuitPermit{breaker: b, key: key}, true, ""
}

func (b *endpointCircuitBreaker) reportSuccess(key string, halfOpen bool) {
	if b == nil || key == "" {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	state, ok := b.states[key]
	if !ok || state == nil {
		state = &endpointCircuitState{}
		b.states[key] = state
	}
	state.State = "closed"
	state.ConsecutiveFailures = 0
	state.OpenUntil = time.Time{}
	state.HalfOpenInFlight = 0
	state.LastSuccessAt = b.now().UTC()
}

func (b *endpointCircuitBreaker) reportFailure(key string, halfOpen bool, policy model.FailoverPolicy, err error) {
	if b == nil || key == "" {
		return
	}
	policy = normalizeFailoverPolicy(policy)

	b.mu.Lock()
	defer b.mu.Unlock()

	state, ok := b.states[key]
	if !ok || state == nil {
		state = &endpointCircuitState{}
		b.states[key] = state
	}
	now := b.now().UTC()
	state.LastFailureAt = now
	if err != nil {
		state.LastError = err.Error()
	}

	if halfOpen {
		state.State = "open"
		state.HalfOpenInFlight = 0
		state.OpenUntil = now.Add(time.Duration(policy.CooldownSeconds) * time.Second)
		if state.ConsecutiveFailures < policy.FailureThreshold {
			state.ConsecutiveFailures = policy.FailureThreshold
		}
		state.ConsecutiveFailures++
		return
	}

	state.ConsecutiveFailures++
	if state.ConsecutiveFailures >= policy.FailureThreshold {
		state.State = "open"
		state.OpenUntil = now.Add(time.Duration(policy.CooldownSeconds) * time.Second)
	}
}
