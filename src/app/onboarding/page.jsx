'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Step components
import CategoryStep from '@/components/onboarding/CategoryStep';
import ProductStep from '@/components/onboarding/ProductStep';
import BudgetStep from '@/components/onboarding/BudgetStep';

const STEPS = [
    { id: 1, title: 'Categorías de gasto', description: 'Crea las categorías que usarás para clasificar tus gastos' },
    { id: 2, title: 'Categorías de ingreso', description: 'Define de dónde viene tu dinero' },
    { id: 3, title: 'Productos de inversión', description: 'Registra los productos donde inviertes (ETFs, fondos, crypto…)' },
    { id: 4, title: 'Presupuesto mensual', description: 'Define cuánto quieres gastar al mes en cada categoría' },
];

export default function OnboardingPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadOnboardingStatus();
    }, []);

    const loadOnboardingStatus = async () => {
        try {
            const res = await fetch('/api/user/onboarding');
            if (res.ok) {
                const data = await res.json();
                // If already completed, redirect to home
                if (data.onboardingStep >= 5) {
                    router.push('/');
                    return;
                }
                // Resume from where they left off
                setCurrentStep(Math.max(1, data.onboardingStep + 1));
            }
        } catch (error) {
            console.error('Error loading onboarding status:', error);
        }
        setLoading(false);
    };

    const updateStep = async (step) => {
        try {
            await fetch('/api/user/onboarding', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step })
            });
        } catch (error) {
            console.error('Error updating onboarding step:', error);
        }
    };

    const handleNext = async () => {
        setSaving(true);
        await updateStep(currentStep);

        if (currentStep < 4) {
            setCurrentStep(currentStep + 1);
        } else {
            // Final step - mark as complete and redirect
            await updateStep(5);
            router.push('/');
        }
        setSaving(false);
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = async () => {
        // Skip onboarding entirely
        await updateStep(5);
        router.push('/');
    };

    if (loading) {
        return (
            <div className="onboarding-container">
                <div className="flex-center" style={{ minHeight: '400px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    const stepInfo = STEPS[currentStep - 1];
    const progress = (currentStep / 4) * 100;

    return (
        <div className="onboarding-container">
            {/* Header */}
            <div className="onboarding-header">
                <div className="onboarding-logo">
                    <span style={{ fontSize: '2rem' }}>💰</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>Finanzas</span>
                </div>
                <button
                    onClick={handleSkip}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.875rem' }}
                >
                    Saltar configuración →
                </button>
            </div>

            {/* Progress */}
            <div className="onboarding-progress">
                <div className="progress-info">
                    <span className="progress-step">Paso {currentStep} de 4</span>
                    <span className="progress-title">{stepInfo.title}</span>
                </div>
                <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                    <div
                        className="progress-bar"
                        style={{
                            width: `${progress}%`,
                            transition: 'width 0.3s ease'
                        }}
                    />
                </div>
            </div>

            {/* Step Content */}
            <div className="onboarding-content">
                <div className="onboarding-step-header">
                    <h1>{stepInfo.title}</h1>
                    <p className="text-muted">{stepInfo.description}</p>
                </div>

                <div className="onboarding-step-body">
                    {currentStep === 1 && <CategoryStep type="expense" />}
                    {currentStep === 2 && <CategoryStep type="income" />}
                    {currentStep === 3 && <ProductStep />}
                    {currentStep === 4 && <BudgetStep />}
                </div>
            </div>

            {/* Footer */}
            <div className="onboarding-footer">
                <button
                    onClick={handleBack}
                    className="btn btn-secondary"
                    disabled={currentStep === 1 || saving}
                >
                    ← Anterior
                </button>
                <button
                    onClick={handleNext}
                    className="btn btn-primary"
                    disabled={saving}
                >
                    {saving ? 'Guardando...' : currentStep === 4 ? '🚀 Empezar a usar mi sistema' : 'Continuar →'}
                </button>
            </div>
        </div>
    );
}
