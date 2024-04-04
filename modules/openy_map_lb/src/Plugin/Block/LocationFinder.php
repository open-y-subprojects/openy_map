<?php

namespace Drupal\openy_map_lb\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Language\LanguageManagerInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\openy_socrates\OpenySocratesFacade;
use Drupal\views\Views;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a block with Location Finder application.
 *
 * @Block(
 *   id = "location_finder_lb",
 *   admin_label = @Translation("Location finder for Layout Builder"),
 *   category = @Translation("Layout Builder")
 * )
 */

class LocationFinder extends BlockBase implements ContainerFactoryPluginInterface {

  const AMENITIES_VOCABULARY = 'amenities';

  /**
   * Openy Socrates Facade.
   *
   * @var \Drupal\openy_socrates\OpenySocratesFacade
   */
  protected $socrates;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected $configFactory;

  /**
   * The language manager.
   *
   * @var \Drupal\Core\Language\LanguageManagerInterface
   */
  protected $languageManager;

  /**
   * {@inheritdoc}
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    OpenySocratesFacade $socrates,
    ConfigFactoryInterface $config_factory,
    EntityTypeManagerInterface $entity_type_manager,
    LanguageManagerInterface $language_manager
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
    $this->socrates = $socrates;
    $this->configFactory = $config_factory;
    $this->taxonomyStorage = $entity_type_manager->getStorage('taxonomy_term');
    $this->languageManager = $language_manager;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('socrates'),
      $container->get('config.factory'),
      $container->get('entity_type.manager'),
      $container->get('language_manager')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function build() {
    return [
      'map' => [
        '#type' => 'openy_map_lb',
        '#show_controls' => TRUE,
        '#amenities' => $this->getAmenities(),
        '#options' => $this->getDistanceMapOptions(),
        '#element_variables' => $this->socrates->getLocationPins(),
      ],
      'results' => $this->getFinderView(),
    ];
  }

  /**
   * Gets Distance filter options.
   *
   * @return array
   */
  private function getDistanceMapOptions() {
    $units_map = [
      'ml' => 'miles',
      'km' => 'kilometers',
    ];
    $distance_in_miles = [5, 10, 30, 50, 100];
    $units = $this->configFactory
      ->get('openy_map.settings')
      ->get('distance_limit_units');
    foreach ($distance_in_miles as $miles) {
      $distance = ($units === 'km') ? $miles * 0.621 : $miles;
      $options[] = [
        'value' => $distance,
        'label' => $this->t('@count @unit',
          [
            '@count' => $miles,
            '@unit' => $units_map[$units],
          ]
        ),
        'selected' => '',
      ];
    }
    return $options;
  }

  /**
   * Gets render arrays for available node types.
   *
   * @return array
   */
  protected function getFinderView() {
    // Location view.
    $locationsView = 'locations_lb';
    $locationDisplay = 'locations_block';

    // Render Locations block display with changed arguments.
    $activeTypes = $this->configFactory->get('openy_map.settings')->get('active_types');
    $activeTypes = !empty($activeTypes) ? array_keys(array_filter($activeTypes)) : [];
    $blockLabels = $this->configFactory->get('openy_map.settings')->get('block_labels');
    $render = [];
    foreach ($activeTypes as $type) {
      $view = Views::getView($locationsView);
      $view->setDisplay($locationDisplay);
      $view->setArguments([$type]);
      $options = [
        'id' => 'area_text_custom',
        'table' => 'views',
        'field' => 'area_text_custom',
        'relationship' => 'none',
        'group_type' => 'none',
        'admin_label' => '',
        'empty' => FALSE,
        'tokenize' => FALSE,
        'content' => '<h2 class="location-title h1 color-purple" style="">' . $blockLabels[$type] . '</h2>',
        'plugin_id' => 'text_custom',
      ];
      $view->setHandler($locationDisplay, 'header', 'area_text_custom', $options);
      $view->preExecute();
      $view->execute();
      $render[] = $view->buildRenderable($locationDisplay, [$type]);
    }
    return $render;
  }

  /**
   * Gets amenities grouped by depth value.
   *
   * @return array
   */
  protected function getAmenities() {
    $result = [
      'type' => 'plain',
      'items' => [],
    ];
    $terms = $this->taxonomyStorage->loadTree(self::AMENITIES_VOCABULARY, 0, 2, TRUE);
    $max_depth = empty($terms) ? 0 : max(array_column($terms, 'depth'));
    if ($max_depth > 0) {
      $result['type'] = 'groups';
    }

    $lang_code = $this->languageManager->getCurrentLanguage()->getId();

    foreach ($terms as $term) {
      /** @var \Drupal\taxonomy\Entity\Term $term */
      if ($term->hasTranslation($lang_code)) {
        $term = $term->getTranslation($lang_code);
      }

      if ( $term->depth === 0 ) {
        $result['items'][$term->id()] = [
          'item' => $term,
          'children' => [],
        ];
      }
      else {
        $parent = array_shift($term->parents);
        $result['items'][$parent]['children'][$term->id()] = [
          'item' => $term
        ];
      }
    }
    return $result;
  }

}
