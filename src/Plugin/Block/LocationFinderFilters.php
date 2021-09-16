<?php

namespace Drupal\openy_map\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\openy_socrates\OpenySocratesFacade;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a block with location finder.
 *
 * @Block(
 *   id = "location_finder_filters",
 *   admin_label = @Translation("Location finder filters"),
 *   category = @Translation("Paragraph Blocks")
 * )
 */
class LocationFinderFilters extends BlockBase implements ContainerFactoryPluginInterface {

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
   * {@inheritdoc}
   */
  public function __construct(array $configuration, $plugin_id, $plugin_definition, OpenySocratesFacade $socrates, ConfigFactoryInterface $config_factory) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
    $this->socrates = $socrates;
    $this->configFactory = $config_factory;
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
      $container->get('config.factory')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function build() {
    return [
      [
        '#type' => 'openy_map',
        '#show_controls' => TRUE,
        '#options' => $this->getDistanceMapOptions(),
        '#element_variables' => $this->socrates->getLocationPins(),
      ],
    ];
  }

  /**
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
        'selected' => $miles === 10 ? 'selected' : '',
      ];
    }
    return $options;
  }

}
