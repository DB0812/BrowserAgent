import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

from app.agent.reasoner import reason
from app.schemas.action import SanitizedContext, UIElement, PIISummary

# Create a test sanitized context for iLovePDF
ctx_ilovepdf = SanitizedContext(
    pageUrl='https://www.ilovepdf.com/',
    pageTitle='iLovePDF | Online PDF tools for PDF lovers',
    pageType='general',
    timestamp=1000,
    elements=[
        UIElement(
            id='el_001',
            elementId='el_001',
            type='link',
            role='PDF tool link: Merge PDF',
            label='Merge PDF',
            sensitive=False,
            bbox={'x': 100, 'y': 200, 'width': 180, 'height': 120},
            domSelector='a[href="/merge-pdf"]',
            interactable=True,
            visible=True,
            tagName='a',
            attributes={'href': 'https://www.ilovepdf.com/merge-pdf'}
        ),
        UIElement(
            id='el_002',
            elementId='el_002',
            type='link',
            role='PDF tool link: Compress PDF',
            label='Compress PDF',
            sensitive=False,
            bbox={'x': 300, 'y': 200, 'width': 180, 'height': 120},
            domSelector='a[href="/compress-pdf"]',
            interactable=True,
            visible=True,
            tagName='a',
            attributes={'href': 'https://www.ilovepdf.com/compress-pdf'}
        )
    ],
    sanitizedText='iLovePDF | Every tool you need to use PDFs, at your fingertips. Merge PDF, Compress PDF.',
    ocrTexts=[],
    piiSummary=PIISummary(totalDetected=0, totalRedacted=0, byType={}),
    screenshotIncluded=False,
    siteAdapter='ilovepdf'
)

# Create a test sanitized context for MakeMyTrip
ctx_mmt = SanitizedContext(
    pageUrl='https://www.makemytrip.com/flights/',
    pageTitle='MakeMyTrip - Flight Booking',
    pageType='travel_booking',
    timestamp=1001,
    elements=[
        UIElement(
            id='el_010',
            elementId='el_010',
            type='tab',
            role='Trip type tab - select One Way',
            label='One Way',
            sensitive=False,
            bbox={'x': 50, 'y': 100, 'width': 80, 'height': 30},
            domSelector='li[data-cy="oneWayTrip"]',
            interactable=True,
            visible=True,
            tagName='li',
            attributes={'data-cy': 'oneWayTrip'}
        ),
        UIElement(
            id='el_011',
            elementId='el_011',
            type='text',
            role='Origin city search input - type city name and click suggestion',
            label='From (Origin City)',
            placeholder='From',
            sensitive=False,
            bbox={'x': 50, 'y': 150, 'width': 200, 'height': 40},
            domSelector='#fromCity',
            interactable=True,
            visible=True,
            tagName='input',
            attributes={'id': 'fromCity'}
        ),
        UIElement(
            id='el_012',
            elementId='el_012',
            type='text',
            role='Destination city search input - type city name and click suggestion',
            label='To (Destination City)',
            placeholder='To',
            sensitive=False,
            bbox={'x': 270, 'y': 150, 'width': 200, 'height': 40},
            domSelector='#toCity',
            interactable=True,
            visible=True,
            tagName='input',
            attributes={'id': 'toCity'}
        )
    ],
    sanitizedText='MakeMyTrip Flights | Book domestic and international flights. From City, To City, Departure Date.',
    ocrTexts=[],
    piiSummary=PIISummary(totalDetected=0, totalRedacted=0, byType={}),
    screenshotIncluded=False,
    siteAdapter='MakeMyTrip'
)

async def run_tests():
    print("=== Testing iLovePDF with Reasoner ===")
    action1, latency1, model1, prompt1, raw1 = await reason(
        task='Merge two PDF files together',
        context=ctx_ilovepdf,
        step=1
    )
    print("Action:", action1)
    print("Latency:", latency1, "ms")
    print("Model:", model1)
    assert action1.action in ("click", "navigate"), f"Expected click/navigate, got {action1.action}"
    print("[OK] iLovePDF test passed!\n")

    print("=== Testing MakeMyTrip with Reasoner ===")
    action2, latency2, model2, prompt2, raw2 = await reason(
        task='Find flights from Delhi to Mumbai',
        context=ctx_mmt,
        step=1
    )
    print("Action:", action2)
    print("Latency:", latency2, "ms")
    print("Model:", model2)
    assert action2.action in ("click", "fill"), f"Expected click/fill, got {action2.action}"
    print("[OK] MakeMyTrip test passed!")

if __name__ == '__main__':
    asyncio.run(run_tests())
