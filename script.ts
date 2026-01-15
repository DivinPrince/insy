const API_URL = 'https://www.jw.org/en/library/bible/study-bible/books/json/data'

async function fetchBibleBookData(): Promise<Root | null> {
  try {
    const response = await fetch(API_URL)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: Root = await response.json() as Root
    console.log("Successfully fetched data for locale:", data.currentLocale)
    return data

  } catch (error) {
    console.error("Could not fetch the Bible book data:", error)
    return null
  }
}

// Example usage/
fetchBibleBookData().then(data => {
  if (data) {
    const genesis = data.editionData.books["40"];
    console.log("Book 40 Name:", genesis.standardName); // Should log: Genesis
  }
});